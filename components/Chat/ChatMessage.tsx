import {
    IconCheck,
    IconCopy,
    IconEdit,
    IconTrash,
    IconBolt,
    IconDownload,
    IconMail,
    IconArrowFork,
    IconHighlight,
} from '@tabler/icons-react';
import React, {FC, memo, useContext, useEffect, useRef, useState} from 'react';
import {useTranslation} from 'next-i18next';
import {saveConversations, updateConversation} from '@/utils/app/conversation';
import {Conversation, DataSource, Message} from '@/types/chat';
import HomeContext from '@/pages/api/home/home.context';
import ChatFollowups from './ChatFollowups';
import ChatContentBlock from "@/components/Chat/ChatContentBlocks/ChatContentBlock";
import UserMessageEditor from "@/components/Chat/ChatContentBlocks/UserMessageEditor";
import AssistantMessageEditor from "@/components/Chat/ChatContentBlocks/AssistantMessageEditor";
import {Prompt} from "@/types/prompt";
import {DownloadModal} from "@/components/Download/DownloadModal";
import Loader from "@/components/Loader/Loader";
import PromptingStatusDisplay from "@/components/Status/PromptingStatusDisplay";
import ChatSourceBlock from "@/components/Chat/ChatContentBlocks/ChatSourcesBlock";
import DataSourcesBlock from "@/components/Chat/ChatContentBlocks/DataSourcesBlock";
import ChatCodeInterpreterFileBlock from './ChatContentBlocks/ChatCodeInterpreterFilesBlock';import { uploadConversation } from '@/services/remoteConversationService';
import { isRemoteConversation } from '@/utils/app/conversationStorage';
import { downloadDataSourceFile } from '@/utils/app/files';
import { Stars } from './Stars';
import { saveUserRating } from '@/services/groupAssistantService';
import { ArtifactsBlock } from './ChatContentBlocks/ArtifactsBlock';
import { User } from './Avatars';
import cloneDeep from 'lodash/cloneDeep';
import { v4 as uuidv4 } from 'uuid';
import AssistantMessageHighlight from './ChatContentBlocks/AssistantMessageHighlight';
import { getSettings } from '@/utils/app/settings';

export interface Props {
    message: Message;
    messageIndex: number;
    onEdit?: (editedMessage: Message) => void,
    onSend: (message: Message[]) => void,
    onSendPrompt: (prompt: Prompt) => void,
    onChatRewrite: (message: Message, updateIndex: number, requestedRewrite: string, prefix: string, suffix: string, feedback: string) => void,
    handleCustomLinkClick: (message: Message, href: string) => void,
}


export const ChatMessage: FC<Props> = memo(({
                                                message,
                                                messageIndex,
                                                onEdit,
                                                onSend,
                                                onSendPrompt,
                                                handleCustomLinkClick,
                                                onChatRewrite
                                                
                                            }) => {
    const {t} = useTranslation('chat');

    const {
        state: {selectedConversation, conversations, messageIsStreaming, artifactIsStreaming, status, folders, featureFlags, statsService},
        dispatch: homeDispatch,
        setLoadingMessage,
        handleUpdateSelectedConversation,
        handleSelectConversation
    } = useContext(HomeContext);


    const conversationsRef = useRef(conversations);

    useEffect(() => {
        conversationsRef.current = conversations;
    }, [conversations]);

    const foldersRef = useRef(folders);

    useEffect(() => {
        foldersRef.current = folders;
    }, [folders]);



    const markdownComponentRef = useRef<HTMLDivElement>(null);

    const [isDownloadDialogVisible, setIsDownloadDialogVisible] = useState<boolean>(false);
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [isTyping, setIsTyping] = useState<boolean>(false);
    const [messageContent, setMessageContent] = useState(message.content);
    const [messagedCopied, setMessageCopied] = useState(false);
    const [editSelection, setEditSelection] = useState<string>("");
    const divRef = useRef<HTMLDivElement>(null);
    const [currentRating, setCurrentRating] = useState<number | undefined>(message.data?.rating);
    const [showFeedbackInput, setShowFeedbackInput] = useState(false);
    const [isHighlightDisplay, setIsHighlightDisplay] = useState(false);

    const [feedbackText, setFeedbackText] = useState('');

    const assistantRecipient = (message.role === "user" && message.data && message.data.assistant) ?
        message.data.assistant : null;


    const toggleEditing = () => {
        setIsEditing(!isEditing);
    };

    const handleEditMessage = () => {

        if (message.content != messageContent) {
            if (selectedConversation && onEdit) {
                onEdit({...message, content: messageContent});
            }
        }
        setIsEditing(false);
    };

    const handleDeleteMessage = () => {
        if (!selectedConversation) return;

        const {messages} = selectedConversation;
        const findIndex = messages.findIndex((elm:Message) => elm === message);

        if (findIndex < 0) return;

        // Find the index of the next 'user' message after findIndex
        let nextUserIndex = findIndex + 1;
        for (let i = findIndex + 1; i < messages.length; i++) {
            nextUserIndex = i;
            if (messages[i].role === 'user') {
                break;
            }
        }

        if (nextUserIndex === messages.length - 1) {
            nextUserIndex = messages.length;
        }

        let deleteCount = nextUserIndex - findIndex;
        console.log("Find Index: " + findIndex + " Next User Index: " + nextUserIndex
            + " Messages Length: " + messages.length + " Delete Count: " + (nextUserIndex - findIndex));

        if (
            findIndex < messages.length - 1 &&
            messages[findIndex + 1].role === 'assistant' &&
            deleteCount > 0
        ) {
            messages.splice(findIndex, deleteCount);
        } else {
            messages.splice(findIndex, 1);
        }
        const updatedConversation = {
            ...selectedConversation,
            messages,
        };

        const {single, all} = updateConversation(
            updatedConversation,
            conversationsRef.current,
        );
        homeDispatch({ field: 'selectedConversation', value: updatedConversation });
        if (isRemoteConversation(updatedConversation)) uploadConversation(updatedConversation, foldersRef.current);
    };

    const copyOnClick = () => {
        if (!navigator.clipboard) return;

        navigator.clipboard.writeText(message.content).then(() => {
            setMessageCopied(true);
            setTimeout(() => {
                setMessageCopied(false);
            }, 2000);
        });
    };


    // needed to avoid editing bug when switching between conversations
    useEffect(() => {
        setMessageContent(message.content);
    }, [message.content]);



    const handleDownload = async (dataSource: DataSource) => {
        //alert("Downloading " + dataSource.name + " from " + dataSource.id);
        try {
            setLoadingMessage("Preparing to Download...");
            downloadDataSourceFile(dataSource);
            
        } catch (e) {
            console.log(e);
            alert("Error downloading file. Please try again.");
        }
        setLoadingMessage("");
    }


    const isActionResult = message.data && message.data.actionResult;
    const isAssistant = message.role === 'assistant';

    let msgStyle = 'bg-gray-50 text-gray-800 border-t dark:border-yellow-500 dark:bg-blue-500/20 dark:text-yellow-500 pt-4 pl-4';
    if(isActionResult){
        msgStyle = 'bg-gray-50 text-gray-800 border-t dark:border-yellow-500 dark:bg-blue-500/20 pt-4 pl-4';
    }
    else if(isAssistant){
        msgStyle = 'bg-gray-50 text-gray-800 border-b dark:border-yellow-500 dark:bg-blue-500/50 pt-4 pl-4';
    }

    const enableTools = !isActionResult;

    const getIcon = () => {
        if (isActionResult) {
            return <IconBolt size={30}/>;
        } else if (isAssistant) {
            return <div className="power-c w-12 h-12 bg-blue-500 p-2 border border-blue-500 dark:border-yellow-500"><svg viewBox="0 0 87 75" className="power-c-chatt-icon"><g><path fill="#FFFFFF" d="M77.5,32.8L85,0H40c-8.5,0-14.9,1.1-19.7,3.4C14.2,6.3,10,11.5,8.5,18.3L0.7,53c-1.4,5.9-0.6,10.6,2.4,14.3 c3.8,4.9,10.6,6.9,22.6,6.9h42.5l5.9-25.7H39.2l3.7-15.8L77.5,32.8L77.5,32.8z"/><path fill="#112E50" d="M34.4,52.3l34.9-0.2l-4,18.1l-39.5,0.2c-10.7,0.1-16.6-1.6-19.6-5.4c-2.2-2.8-2.7-6.3-1.8-11l7.8-34.7 c1.3-5.7,4.5-9.8,9.6-12.4C26.1,5,31.9,4,39.9,3.9l40.2-0.2l-5.7,25l-27,0.2l1.7-7.1l-7.9,0L34.4,52.3z"/><path fill="#FDB733" d="M77.3,6.6l-4.5,19.8H51.2l1.7-7.1H39.6L31.4,55h34.9l-3,12.8H25.9c-14,0-21.1-2.7-18.7-13.3l8-34.7 C17.5,9.5,26.5,6.5,40.4,6.5L77.3,6.6L77.3,6.6z"/></g></svg></div>; 
        } else {
            return <User/> 
        }
    }

    const getAtBlock = () => {
        if(!isActionResult &&
            assistantRecipient &&
            assistantRecipient.definition &&
            assistantRecipient.definition.name &&
            assistantRecipient.definition.assistantId) {
            return (<span className="bg-neutral-300 dark:bg-neutral-600 rounded-xl pr-1 pl-1">
                                                        {"@" + assistantRecipient.definition.name + ":"}
                                                    </span>);
        } else if(!isActionResult) {
            return (<span className="hidden bg-neutral-300 dark:bg-neutral-600 rounded-xl pr-1 pl-1">
                                                        @Amplify:
                                                    </span>);
        } else {
           return (<span className="bg-yellow-500 dark:bg-yellow-500 text-black rounded-xl py-1.5 pr-1 pl-1">
                                                        {'\u2713 Action Completed:'}
                                                    </span>);
        }
    }

    const handleRatingSubmit = (r: number) => {
        setCurrentRating(r);
        if (selectedConversation) {
            const updatedMessage = { ...message, data: { ...message.data, rating: r } };
            let updatedConversation: Conversation = { ...selectedConversation };
            updatedConversation.messages[messageIndex] = updatedMessage;
            handleUpdateSelectedConversation(updatedConversation);

            statsService.saveUserRatingEvent(selectedConversation.id, r);
            saveUserRating(selectedConversation.id, r)
                .then((result) => {
                    if (!result.success) {
                        console.error('Failed to save user rating');
                    } else {
                        setShowFeedbackInput(true);
                    }
                })
                .catch((error) => {
                    console.error('Error saving user rating');
                });
        }
    };

    const handleForkConversation = async () => {
        statsService.forkConversationEvent();
        if (selectedConversation) {
            setLoadingMessage("Forking Conversation...");
            const newConversation = cloneDeep({...selectedConversation,  id: uuidv4(), messages: selectedConversation?.messages.slice(0, messageIndex + 1)});
            if (isRemoteConversation(newConversation)) await uploadConversation(newConversation, foldersRef.current);
            statsService.newConversationEvent();

            const updatedConversations = [...conversationsRef.current, newConversation];
            homeDispatch({ field: 'conversations', value: updatedConversations });
            saveConversations(updatedConversations);
            setLoadingMessage("");
            handleSelectConversation(newConversation);
        }
        
    };

    const handleFeedbackSubmit = () => {
        if (selectedConversation && currentRating !== undefined) {
            statsService.saveUserRatingEvent(selectedConversation.id, currentRating, feedbackText);
            saveUserRating(selectedConversation.id, currentRating, feedbackText)
                .then((result) => {
                    if (result.success) {
                        setShowFeedbackInput(false);
                        setFeedbackText('');
                    } else {
                        console.error('Failed to save user feedback');
                    }
                })
                .catch((error) => {
                    console.error('Error saving user feedback');
                });
        } else {
            console.error('No rating available or conversation not selected');
        }
    };

    // @ts-ignore
    return (
        <div
            className={`group md:px-4 ${msgStyle}`}
            style={{overflowWrap: 'anywhere'}}
        >

            {isDownloadDialogVisible && (
                <DownloadModal
                    includeConversations={false}
                    includePrompts={false}
                    includeFolders={false}
                    showHeaders={false}
                    showInclude={false}
                    selectedMessages={[message]}
                    selectedConversations={selectedConversation ? [selectedConversation] : []}
                    onCancel={() => {
                        setIsDownloadDialogVisible(false);
                    }}
                    onDownloadReady={function (url: string): void {

                    }}/>
            )}

            <div
                className="relative m-auto flex p-2 text-base md:max-w-2xl md:gap-6 md:py-2 lg:max-w-2xl lg:px-0 xl:max-w-3xl">
                <div className="min-w-[40px] text-right font-bold">
                    {getIcon()}
                </div>

                <div className="prose mt-[-2px] w-full dark:prose-invert mr-5">
                    {message.role === 'user' ? (
                        <div className="flex flex-grow">
                            {isEditing ? (

                                <UserMessageEditor
                                    message={message}
                                    handleEditMessage={handleEditMessage}
                                    setIsEditing={setIsEditing}
                                    isEditing={isEditing}
                                    messageContent={messageContent}
                                    setMessageContent={setMessageContent}/>

                            ) : (
                                <div className="flex flex-grow flex-col">
                                    <div className="flex flex-col">
                                        <div className="flex flex-row">
                                            <div className="prose whitespace-pre-wrap dark:prose-invert flex-1">
                                                {getAtBlock()} {message.label || message.content}
                                            </div>
                                        </div>
                                        <DataSourcesBlock message={message} handleDownload={handleDownload}/>
                                        {isActionResult && (
                                            <ChatSourceBlock
                                                messageIsStreaming={messageIsStreaming}
                                                message={message}
                                            />
                                        )}
                                    </div>
                                    <div className="flex flex-row">
                                        {(isEditing || messageIsStreaming) ? null : (

                                            <ChatFollowups promptSelected={(p) => {
                                                onSendPrompt(p)
                                            }}/>

                                        )}
                                    </div>
                                </div>
                            )}

                            {!isEditing && (
                                <div
                                    className="md:-mr-8 ml-1 md:ml-0 flex flex-col md:flex-col items-center md:items-start justify-end md:justify-start">
                                    <div>
                                        {messagedCopied ? (
                                            <IconCheck
                                                size={20}
                                                className="text-green-500 dark:text-green-400"
                                            />
                                        ) : (
                                            <button
                                                className="invisible group-hover:visible focus:visible text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                                onClick={copyOnClick}
                                                title="Copy Prompt"
                                            >
                                                <IconCopy size={20}/>
                                            </button>
                                        )}
                                    </div>
                                    {!isActionResult && (
                                    <div>
                                        <button
                                            className="invisible group-hover:visible focus:visible text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                            onClick={() => setIsDownloadDialogVisible(true)}
                                            title="Download Prompt"
                                        >
                                            <IconDownload size={20}/>
                                        </button>
                                    </div>)
                                    }
                                    <div>
                                        <button
                                            className="invisible group-hover:visible focus:visible text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                            onClick={toggleEditing}
                                            title="Edit Prompt"
                                        >
                                            <IconEdit size={20}/>
                                        </button>
                                    </div>
                                    <button
                                        className="invisible group-hover:visible focus:visible text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                        onClick={handleForkConversation}
                                        title="Branch Into A Conversation"
                                    >
                                        <IconArrowFork size={20}/>
                                    </button>
                                    {!isActionResult && (
                                    <div>
                                        <button
                                            className="invisible group-hover:visible focus:visible text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                            onClick={handleDeleteMessage}
                                            title="Delete Prompt"
                                        >
                                            <IconTrash size={20}/>
                                        </button>
                                    </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : ( // Assistant message
                        <div className="flex flex-col w-full" ref={markdownComponentRef}>
                            <div className="flex flex-row w-full">
                                <div className="flex flex-col w-full">
                                    {(selectedConversation?.messages.length === messageIndex + 1) && (
                                        <PromptingStatusDisplay statusHistory={status}/>
                                    )}
                                     {featureFlags.highlighter && getSettings(featureFlags).featureOptions.includeHighlighter && 
                                      isHighlightDisplay && !isEditing && 

                                        <AssistantMessageHighlight
                                            messageIndex={messageIndex}
                                            message={message}
                                            selectedConversation={selectedConversation}
                                            setIsHighlightDisplay={setIsHighlightDisplay}
                                        />
                                        
                                        }
                                    {!isEditing && !isHighlightDisplay && (
                                         <> 
                                        <div className="flex flex-grow"
                                             ref={divRef}
                                        >
                                            <ChatContentBlock
                                                messageIsStreaming={messageIsStreaming}
                                                messageIndex={messageIndex}
                                                message={message}
                                                selectedConversation={selectedConversation}
                                                handleCustomLinkClick={handleCustomLinkClick}
                                            />
                                        </div>
                                       
                                        {featureFlags.artifacts && 
                                        <ArtifactsBlock 
                                            message={message}
                                            messageIndex={messageIndex}
                                        />}

                                        <ChatCodeInterpreterFileBlock
                                            messageIsStreaming={messageIsStreaming}
                                            message={message}
                                        />
                                        <ChatSourceBlock
                                            messageIsStreaming={messageIsStreaming}
                                            message={message}
                                        />
                                        </>
                                    )}
                                    {isEditing && (
                                        <AssistantMessageEditor
                                            message={message}
                                            handleEditMessage={handleEditMessage}
                                            setIsEditing={setIsEditing}
                                            isEditing={isEditing}
                                            messageContent={messageContent}
                                            setMessageContent={setMessageContent}/>
                                    )}
                                </div>

                                { !isEditing && <div
                                    className="md:-mr-8 ml-1 md:ml-0 flex flex-col md:flex-col gap-4 md:gap-1 items-center md:items-start justify-end md:justify-start">
                                    {messagedCopied ? (
                                        <IconCheck
                                            size={20}
                                            className="text-green-500 dark:text-green-400"
                                        />
                                    ) : (
                                        <button
                                            className="invisible group-hover:visible focus:visible text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                            onClick={copyOnClick}
                                            title="Copy Response"
                                        >
                                            <IconCopy size={20}/>
                                        </button>
                                    )}
                                    <button
                                        className="invisible group-hover:visible focus:visible text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                        onClick={() => setIsDownloadDialogVisible(true)}
                                        title="Download Response"
                                    >
                                        <IconDownload size={20}/>
                                    </button>
                                    <button
                                        className="invisible group-hover:visible focus:visible text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                        title="Email Response"
                                    >
                                        <a className="invisible group-hover:visible focus:visible text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                           href={`mailto:?body=${encodeURIComponent(messageContent)}`}>
                                            <IconMail size={20}/>
                                        </a>
                                    </button>
                                    {featureFlags.highlighter && 
                                     getSettings(featureFlags).featureOptions.includeHighlighter && 
                                        <button
                                            className="invisible group-hover:visible focus:visible text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                            onClick={() => {setIsHighlightDisplay(!isHighlightDisplay)}}
                                            title="Prompt On Highlight"
                                        >
                                            <IconHighlight size={20}/>
                                        </button>
                                    }
                                    <button
                                        className="invisible group-hover:visible focus:visible text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                        onClick={toggleEditing}
                                        title="Edit Response"
                                    >
                                        <IconEdit size={20}/>
                                    </button>
                                    <button
                                        className="invisible group-hover:visible focus:visible text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                        onClick={handleForkConversation}
                                        title="Branch Into A Conversation"
                                    >
                                        <IconArrowFork size={20}/>
                                    </button>


                                </div>}
                            </div>
                            {(messageIsStreaming || isEditing) ? null : (
                                <ChatFollowups promptSelected={(p) => {
                                    onSendPrompt(p)
                                }}/>
                            )}
                            {message.data?.state?.currentAssistantId && message.data?.state?.currentAssistantId.startsWith('astgp') && !messageIsStreaming && !isEditing && (
                                <>
                                    <Stars
                                        starRating={message.data?.rating || 0}
                                        setStars={handleRatingSubmit}
                                    />
                                    {showFeedbackInput && (
                                        <div className="mt-2">
                                            <textarea
                                                className="w-full p-2 border rounded bg-white text-gray-800 dark:bg-gray-700 dark:text-white"
                                                value={feedbackText}
                                                onChange={(e) => setFeedbackText(e.target.value)}
                                                placeholder="Please provide any additional feedback"
                                            />
                                            <button
                                                className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
                                                onClick={() => {
                                                    handleFeedbackSubmit();
                                                    setShowFeedbackInput(false);
                                                }}
                                            >
                                                Submit Feedback
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                            {((messageIsStreaming || artifactIsStreaming) && messageIndex == (selectedConversation?.messages.length ?? 0) - 1) ?
                                // <LoadingIcon />
                                <Loader type="ping" size="48"/>
                                : null}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
});
ChatMessage.displayName = 'ChatMessage';
