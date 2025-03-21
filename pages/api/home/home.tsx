import { useEffect, useRef, useState, useCallback } from 'react';
import { GetServerSideProps } from 'next';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Head from 'next/head';
import { Tab, TabSidebar } from "@/components/TabSidebar/TabSidebar";
import { SettingsBar } from "@/components/Settings/SettingsBar";
import { checkDataDisclosureDecision, getLatestDataDisclosure, saveDataDisclosureDecision } from "@/services/dataDisclosureService";
import { CloudConvAttr, getIsLocalStorageSelection, isRemoteConversation, pickConversationAttributes, updateWithRemoteConversations } from '@/utils/app/conversationStorage';
import cloneDeep from 'lodash/cloneDeep';
import {styled} from "styled-components";
import {LoadingDialog} from "@/components/Loader/LoadingDialog";


import {
    cleanConversationHistory,
} from '@/utils/app/clean';
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_TEMPERATURE } from '@/utils/app/const';
import {
    saveConversations,
    saveConversationDirect,
    saveConversationsDirect,
    updateConversation,
    compressAllConversationMessages,
    conversationWithUncompressedMessages,
    conversationWithCompressedMessages,
} from '@/utils/app/conversation';
import { saveFolders } from '@/utils/app/folders';
import { savePrompts } from '@/utils/app/prompts';
import { getSettings, saveSettings } from '@/utils/app/settings';
import { getAccounts } from "@/services/accountService";

import { Conversation, Message } from '@/types/chat';
import { KeyValuePair } from '@/types/data';
import { FolderInterface, FolderType } from '@/types/folder';
import { ModelID, Models, fallbackModelID, Model } from '@/types/model';
import { Prompt } from '@/types/prompt';


import { Chat } from '@/components/Chat/Chat';
import { Chatbar } from '@/components/Chatbar/Chatbar';
import { Navbar } from '@/components/Mobile/Navbar';
import Promptbar from '@/components/Promptbar';
import {
    Icon3dCubeSphere,
    IconTournament,
    IconShare,
    IconMessage,
    IconSettings,
} from "@tabler/icons-react";
import { IconLogout } from "@tabler/icons-react";

import { initialState } from './home.state';
import useEventService from "@/hooks/useEventService";
import { v4 as uuidv4 } from 'uuid';


import { WorkflowDefinition } from "@/types/workflow";
import { saveWorkflowDefinitions } from "@/utils/app/workflows";
import SharedItemsList from "@/components/Share/SharedItemList";
import { saveFeatures } from "@/utils/app/features";
import WorkspaceList from "@/components/Workspace/WorkspaceList";
import { Market } from "@/components/Market/Market";
import { useSession, signIn, signOut, getSession } from "next-auth/react"
import Loader from "@/components/Loader/Loader";
import { useHomeReducer } from "@/hooks/useHomeReducer";
import { MyHome } from "@/components/My/MyHome";
import { DEFAULT_ASSISTANT } from '@/types/assistant';
import { deleteAssistant, listAssistants } from '@/services/assistantService';
import { getAssistant, isAssistant, syncAssistants } from '@/utils/app/assistants';
import { deleteRemoteConversation, fetchAllRemoteConversations, fetchRemoteConversation, uploadConversation } from '@/services/remoteConversationService';
import {killRequest as killReq} from "@/services/chatService";
import { DefaultUser } from 'next-auth';
import { addDateAttribute, getDate, getDateName } from '@/utils/app/date';
import HomeContext, {  ClickContext, Processor } from './home.context';
import { ReservedTags } from '@/types/tags';
import { noCoaAccount } from '@/types/accounts';
import { noRateLimit } from '@/types/rateLimit';
import { fetchAstAdminGroups, checkInAmplifyCognitoGroups } from '@/services/groupsService';
import { AmpCognGroups, AmplifyGroups } from '@/types/groups';
import { contructGroupData } from '@/utils/app/groups';
import { getAllArtifacts } from '@/services/artifactsService';
import { baseAssistantFolder, basePrompt, isBaseFolder, isOutDatedBaseFolder } from '@/utils/app/basePrompts';
import { fetchUserSettings } from '@/services/settingsService';
import { Settings } from '@/types/settings';

const LoadingIcon = styled(Icon3dCubeSphere)`
  color: lightgray;
  height: 150px;
  width: 150px;
`;


interface Props {
    defaultModelId: ModelID;
    
  ClientId: string | null;
    cognitoDomain: string | null;
    cognitoClientId: string | null;
    mixPanelToken: string;
    chatEndpoint: string | null;
    availableModels: string | null;
}


const Home = ({
    defaultModelId,
    cognitoClientId,
    cognitoDomain,
    mixPanelToken,
    chatEndpoint,
    availableModels
}: Props) => {
    const { t } = useTranslation('chat');
    const [initialRender, setInitialRender] = useState<boolean>(true);
    // const [loadingSelectedConv, setLoadingSelectedConv] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string>('');

    const [loadingAmplify, setLoadingAmplify] = useState<boolean>(true);
    const { data: session, status } = useSession();
    const [user, setUser] = useState<DefaultUser | null>(null);

    const isLoading = status === "loading";
    const userError = null;

    const contextValue = useHomeReducer({
        initialState: {
            ...initialState,
            statsService: useEventService(mixPanelToken) },
    });


    const {
        state: {
            conversationStateId,
            messageIsStreaming,
            currentRequestId,
            lightMode,
            folders,
            workflows,
            conversations,
            selectedConversation,
            prompts,
            temperature,
            selectedAssistant,
            page,
            statsService,
            latestDataDisclosureUrlPDF,
            latestDataDisclosureHTML,
            inputEmail,
            hasAcceptedDataDisclosure,
            hasScrolledToBottom,
            featureFlags,
            storageSelection,
            groups,
            models

        },
        dispatch,
    } = contextValue;


    const promptsRef = useRef(prompts);


    useEffect(() => {
        promptsRef.current = prompts;
      }, [prompts]);


    const conversationsRef = useRef(conversations);

    useEffect(() => {
        conversationsRef.current = conversations;
    }, [conversations]);


    const foldersRef = useRef(folders);

    useEffect(() => {
        foldersRef.current = folders;
    }, [folders]);


    const stopConversationRef = useRef<boolean>(false);


    // This is where tabs will be sync'd
    useEffect(() => {
        const handleStorageChange = (event: any) => {
            if (event.key === "conversationHistory") {
                const conversations = JSON.parse(event.newValue);
                dispatch({ field: 'conversations', value: conversations });
            } else if (event.key === "folders") {
                const folders = JSON.parse(event.newValue);
                dispatch({ field: 'folders', value: folders });
            } else if (event.key === "prompts") {
                const prompts = JSON.parse(event.newValue);
                dispatch({ field: 'prompts', value: prompts });
            }
        };

        window.addEventListener('storage', handleStorageChange);

        // Remove the event listener on cleanup
        return () => {
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);


    useEffect(() => {
        if (availableModels) {
            const modelList = availableModels.split(",");

            const models: Model[] = modelList.reduce((result: Model[], model: string) => {
                const model_name = model;

                for (const [key, value] of Object.entries(ModelID)) {
                    if (value === model_name && modelList.includes(model_name)) {
                        result.push({
                            id: model_name,
                            name: Models[value].name,
                            maxLength: Models[value].maxLength,
                            tokenLimit: Models[value].tokenLimit,
                            actualTokenLimit: Models[value].actualTokenLimit,
                            inputCost: Models[value].inputCost,
                            outputCost: Models[value].outputCost,
                            description: Models[value].description
                        });
                    }
                }
                return result;
            }, []);

            dispatch({ field: 'models', value: models });
        }
    }, [availableModels, dispatch]);

    useEffect(() => {
        if (chatEndpoint) dispatch({ field: 'chatEndpoint', value: chatEndpoint });
    }, [chatEndpoint]);


    const handleSelectConversation = async (conversation: Conversation) => {
        window.dispatchEvent(new CustomEvent('openArtifactsTrigger', { detail: { isOpen: false}} ));
        window.dispatchEvent(new Event('cleanupApiKeys'));
        // if we click on the conversation we are already on, then dont do anything
        if (selectedConversation && (conversation.id === selectedConversation.id) && isRemoteConversation(selectedConversation)) return;
        //loading 
        //old conversations that do not have IsLocal are automatically local
        if (!('isLocal' in conversation)) {
            conversation.isLocal = true;
        }
        // setLoadingSelectedConv(true);
        setLoadingMessage('Loading Conversation...');

        let newSelectedConv = null;
        // check if it isLocal? if not get the conversation from s3
        if (isRemoteConversation(conversation)) { 
            const remoteConversation = await fetchRemoteConversation(conversation.id, conversationsRef.current, dispatch);
            if (remoteConversation) {
                newSelectedConv = remoteConversation;
            }
        } else {
            newSelectedConv = conversationWithUncompressedMessages(cloneDeep(conversation));
        }
        setLoadingMessage('');

        if (newSelectedConv) {
        //add last used assistant if there was one used else should be removed
        if (newSelectedConv.messages && newSelectedConv.messages.length > 0) {
            const lastMessage: Message = newSelectedConv.messages[newSelectedConv.messages.length - 1];
            if (lastMessage.data && lastMessage.data.state && lastMessage.data.state.currentAssistant) {
                const astName = lastMessage.data.state.currentAssistant;
                const assistantPrompt =  promptsRef.current.find((prompt:Prompt) => prompt.name === astName);
                const assistant = assistantPrompt?.data?.assistant ? assistantPrompt.data.assistant : DEFAULT_ASSISTANT;
                dispatch({ field: 'selectedAssistant', value: assistant });
            }
        } else {
            dispatch({ field: 'selectedAssistant', value: DEFAULT_ASSISTANT });
        }

        dispatch({ field: 'page', value: 'chat' })

        dispatch({  field: 'selectedConversation',
                    value: newSelectedConv
                });
        }
    };




    // Feature OPERATIONS  --------------------------------------------

    const handleToggleFeature = (name: string) => {
        const features = { ...contextValue.state.featureFlags };
        features[name] = !features[name];

        dispatch({ field: 'featureFlags', value: features });
        saveFeatures(features);

        return features;
    };

    // FOLDER OPERATIONS  --------------------------------------------

    const killRequest = async (requestId:string) => {
        const session = await getSession();

        // @ts-ignore
        if(!session || !session.accessToken || !chatEndpoint){
            return false;
        }

        // @ts-ignore
        const result = await killReq(chatEndpoint, session.accessToken, requestId);

        return result;
    }

    const shouldStopConversation = () => {
        return stopConversationRef.current;
    }

    const handleStopConversation = async () => {
        stopConversationRef.current = true;

        if (currentRequestId) {
            try{
                await killRequest(currentRequestId);
            } catch(e) {
                console.error("Error killing request", e);
            }
        }

        setTimeout(() => {
            stopConversationRef.current = false;

            dispatch({field: 'loading', value: false});
            dispatch({field: 'messageIsStreaming', value: false});
            dispatch({field: 'status', value: []});
        }, 1000);
    };

    const handleCreateFolder = (name: string, type: FolderType):FolderInterface => {

        const newFolder: FolderInterface = {
            id: uuidv4(),
            date: getDate(),
            name,
            type,
        };

        const updatedFolders = [...folders, newFolder];

        dispatch({ field: 'folders', value: updatedFolders });
        saveFolders(updatedFolders);
        foldersRef.current = updatedFolders;
        return newFolder;
    };

    const handleDeleteFolder = (folderId: string) => {
        const folderType : FolderType | undefined= foldersRef.current.find((f:FolderInterface) => f.id === folderId)?.type;
        
        console.log("Deleting folder of type: ", folderType);

        switch (folderType) {
            case 'chat':
            const updatedConversations = conversationsRef.current.reduce((acc: Conversation[], c:Conversation) => {
                                            if (c.folderId === folderId) {
                                                statsService.deleteConversationEvent(c);
                                                if (isRemoteConversation(c)) deleteRemoteConversation(c.id);
                                            } else {
                                                acc.push(c);
                                            }
                                            return acc;
                                        }, [] as Conversation[]);

            dispatch({ field: 'conversations', value: updatedConversations });
            saveConversations(updatedConversations);

            if (updatedConversations.length > 0) {
                const selectedNotDeleted = selectedConversation ?
                    updatedConversations.some((conversation:Conversation) =>
                        conversation.id === selectedConversation.id) : false;
                if (!selectedNotDeleted) { // was deleted
                    const newSelectedConversation = updatedConversations[updatedConversations.length - 1];
                    dispatch({
                        field: 'selectedConversation',
                        value: newSelectedConversation,
                    });
                    localStorage.setItem('selectedConversation', JSON.stringify(newSelectedConversation));
                }

            } else {
                defaultModelId &&
                    dispatch({
                        field: 'selectedConversation',
                        value: {
                            id: uuidv4(),
                            name: t('New Conversation'),
                            messages: [],
                            model: Models[defaultModelId],
                            prompt: DEFAULT_SYSTEM_PROMPT,
                            temperature: DEFAULT_TEMPERATURE,
                            folderId: null,
                            isLocal: getIsLocalStorageSelection(storageSelection)

                        },
                    });

                localStorage.removeItem('selectedConversation');
            }
                break
            case 'prompt':
                const updatedPrompts: Prompt[] =  promptsRef.current.map((p:Prompt) => {
                    if (p.folderId === folderId) {
                        const isReserved = (isAssistant(p) && p?.data?.tags?.includes(ReservedTags.SYSTEM));
                        if (isReserved) {
                            return {
                                ...p,
                                folderId: null,
                            };
                        }
                        const canDelete = (!p.data || !p.data.noDelete); 
        
                        if (selectedAssistant && p?.data?.assistant?.definition.assistantId === selectedAssistant.definition.assistantId) dispatch({ field: 'selectedAssistant', value: DEFAULT_ASSISTANT }); 
                        if(isAssistant(p) && canDelete ){
                           const assistant = getAssistant(p);
                           if (assistant && assistant.assistantId) deleteAssistant(assistant.assistantId);
                        }
                        return undefined;
                    }
                    return p;
                }).filter((p): p is Prompt => p !== undefined);;
        
                dispatch({ field: 'prompts', value: updatedPrompts });
                savePrompts(updatedPrompts);
                    break
            case 'workflow':
                const updatedWorkflows: WorkflowDefinition[] = workflows.map((p:WorkflowDefinition) => {
                    if (p.folderId === folderId) {
                        return {
                            ...p,
                            folderId: null,
                        };
                    }
                    return p;
                });
        
                dispatch({ field: 'workflows', value: updatedWorkflows });
                saveWorkflowDefinitions(updatedWorkflows);
                break
        }
        const updatedFolders = foldersRef.current.filter((f:FolderInterface) => (f.id !== folderId));
        console.log("Deleting folder ", folderId, "of type: ", updatedFolders);

        
        dispatch({ field: 'folders', value: updatedFolders });
        saveFolders(updatedFolders);
        foldersRef.current = updatedFolders;
    };


    const handleUpdateFolder = (folderId: string, name: string) => {
        const updatedFolders = foldersRef.current.map((f:FolderInterface) => {
            if (f.id === folderId) {
                return {...f, name: name};
            }
            return f;
        });
        dispatch({ field: 'folders', value: updatedFolders });
        saveFolders(updatedFolders);
    };

    // CONVERSATION OPERATIONS  --------------------------------------------

    const handleNewConversation = async (params = {}) => {
        dispatch({ field: 'selectedAssistant', value: DEFAULT_ASSISTANT });
        dispatch({ field: 'page', value: 'chat' })

        const lastConversation = conversationsRef.current[conversationsRef.current.length - 1];

        // Create a string for the current date like Oct-18-2021
        const date = getDateName();

        // See if there is a folder with the same name as the date
        let folder = foldersRef.current.find((f:FolderInterface) => f.name === date);

        if (!folder) {
            folder = handleCreateFolder(date, "chat");
        }

        const newConversation: Conversation = {
            id: uuidv4(),
            name: t('New Conversation'),
            messages: [],
            model: lastConversation?.model || {
                id: Models[defaultModelId].id,
                name: Models[defaultModelId].name,
                maxLength: Models[defaultModelId].maxLength,
                tokenLimit: Models[defaultModelId].tokenLimit,
            },
            prompt: DEFAULT_SYSTEM_PROMPT,
            temperature: lastConversation?.temperature ?? DEFAULT_TEMPERATURE,
            folderId: folder.id,
            promptTemplate: null,
            isLocal: getIsLocalStorageSelection(storageSelection),
            ...params
        };
        if (isRemoteConversation(newConversation)) uploadConversation(newConversation, foldersRef.current);

        statsService.newConversationEvent();

        const updatedConversations = [...conversationsRef.current, newConversation];

        dispatch({ field: 'selectedConversation', value: newConversation });
        dispatch({ field: 'conversations', value: updatedConversations });

        saveConversations(updatedConversations);

        dispatch({ field: 'loading', value: false });
    };

    const handleUpdateSelectedConversation = (updatedConversation: Conversation) => {
        // console.log("update selected: ", updatedConversation);
        let updatedConversations: Conversation[] = [...conversationsRef.current];

        if (selectedConversation && selectedConversation.isLocal) {
            updatedConversations = updatedConversations.map(
                (conversation:Conversation) => {
                    if (conversation.id === selectedConversation.id) {
                        return conversationWithCompressedMessages(updatedConversation);
                    }
                    return conversation;
                },
            );
            if (updatedConversations.length === 0) updatedConversations.push(conversationWithCompressedMessages(updatedConversation));
            
        } else {
            uploadConversation(updatedConversation, foldersRef.current);
            updatedConversations = updatedConversations.map(
                (conversation:Conversation) => {
                    if (selectedConversation && conversation.id === selectedConversation.id) {
                        return pickConversationAttributes(cloneDeep(updatedConversation), CloudConvAttr) as Conversation;
                    }
                    return conversation;
                },
            );
            if (updatedConversations.length === 0) updatedConversations.push( pickConversationAttributes(updatedConversation, CloudConvAttr) as Conversation );
        }
    
        dispatch({
            field: 'selectedConversation',
            value: updatedConversation,
        }); 

        dispatch({field: 'conversations', value: updatedConversations});
        saveConversations(updatedConversations);
    }


    const handleUpdateConversation = (
        conversation: Conversation,
        data: KeyValuePair,
    ) => {

        // console.log("Previous Conversation: ", conversation)
        // console.log("Updating data: ", data)

        const updatedConversation = {
            ...conversation,
            [data.key]: data.value,
        };

        // console.log("Updated Conversation", updatedConversation)


        const { single, all } = updateConversation(
            updatedConversation,
            conversations, 
        );

        if (selectedConversation && selectedConversation.id === updatedConversation.id) {
            dispatch({field: 'selectedConversation', value: conversationWithUncompressedMessages(single)});
        }

        if (isRemoteConversation(updatedConversation)) uploadConversation(conversationWithUncompressedMessages(single), foldersRef.current);
       
        dispatch({ field: 'conversations', value: all });
    };

    const clearWorkspace = async () => {
        dispatch({ field: 'conversations', value: [] });
        dispatch({ field: 'prompts', value: [] });
        dispatch({ field: 'folders', value: [] });

        saveConversations([]);
        saveFolders([]);
        savePrompts([]);

        dispatch({ field: 'selectedConversation', value: null });
    }

    useEffect(() => {
        if (!messageIsStreaming &&
            conversationStateId !== "init" &&
            conversationStateId !== "post-init"
        ) {

            if (selectedConversation) {
                saveConversationDirect(selectedConversation);
            }
            saveConversationsDirect(conversationsRef.current);
        }
    }, [conversationStateId]);

    // useEffect(() => {
    //     const getOps = async () => {
    //         try {
    //             const ops = await getOpsForUser();
    //
    //             const opMap:{[key:string]:any} = {};
    //             ops.data.forEach((op:any) => {
    //                 opMap[op.id] = op;
    //             })
    //
    //             console.log("Ops", opMap)
    //             dispatch({field: 'ops', value: opMap});
    //         } catch (e) {
    //             console.error('Error getting ops', e);
    //         }
    //     }
    //     if(session?.user) {
    //        getOps();
    //     }
    // }, [user]);

    const handleAddMessages = async (selectedConversation: Conversation | undefined, messages: any) => {
        if (selectedConversation) {
            dispatch(
                {
                    type: 'conversation',
                    action: {
                        type: 'addMessages',
                        conversationId: selectedConversation.id,
                        messages: messages
                    }
                }
            )
        }


    };

    // EFFECTS  --------------------------------------------

    useEffect(() => {
        if (window.innerWidth < 640) {
            dispatch({ field: 'showChatbar', value: false });
            dispatch({ field: 'showPromptbar', value: false });
        }
    }, [selectedConversation]);

    useEffect(() => {
        defaultModelId &&
            dispatch({ field: 'defaultModelId', value: defaultModelId });
        
    }, [defaultModelId]);

    useEffect (() => {
        if (!user && session?.user) setUser(session.user as DefaultUser);
    }, [session])


    useEffect(() => {
        // @ts-ignore
        if (["RefreshAccessTokenError", "SessionExpiredError"].includes(session?.error)) {
            signOut();
            setUser(null);
        }
    }, [session]);



    // Amplify Data Calls - Happens Right After On Load--------------------------------------------

    useEffect(() => {
        const fetchAccounts = async () => {      
            console.log("Fetching Accounts...");
            try {
                const response = await getAccounts();
                if (response.success) {
                    const defaultAccount = response.data.find((account: any) => account.isDefault);
                    if (defaultAccount && !defaultAccount.rateLimit) defaultAccount.rateLimit = noRateLimit; 
                    setLoadingAmplify(false); 
                    dispatch({ field: 'defaultAccount', value: defaultAccount || noCoaAccount});  
                    return;
                } else {
                    console.log("Failed to fetch accounts.");
                }
            } catch (e) {
                console.log("Failed to fetch accounts: ", e);
            }
            dispatch({ field: 'defaultAccount', value: noCoaAccount}); 
            setLoadingAmplify(false);   
        };

        const fetchSettings = async () => {
            console.log("Fetching Settings...");
            try {
                // returns the groups you are inquiring about in a object with the group as the key and is they are on the group as the value
                const result = await fetchUserSettings();
                if (result.success) {
                    if (result.data) { 
                        saveSettings(result.data as Settings);
                    }
                } else {
                    console.log("Failed to get user settings: ", result);
                }
            } catch (e) {
                console.log("Failed to get user settings: ", e);
            }
        }

        const fetchArtifacts = async () => {      
            console.log("Fetching Remote Artifacts...");
            const response = await getAllArtifacts();
            if (response.success) { 
                if (response.data) dispatch({ field: 'artifacts', value: response.data});  
            } else {
                console.log("Failed to fetch remote Artifacts.");
            } 
        };

        const fetchInAmpCognGroup = async () => {
            // here you define any groups you want to check exist for the user in the cognito users table
            const groups : AmpCognGroups = {
                amplifyGroups: [AmplifyGroups.AST_ADMIN_INTERFACE],
                // cognitoGroups: []
            }
            try {
                // returns the groups you are inquiring about in a object with the group as the key and is they are on the group as the value
                const result = await checkInAmplifyCognitoGroups(groups);
                if (result.success) {
                    const inGroups = result.data;
                    dispatch({ field: 'featureFlags', 
                                value: {...featureFlags, assistantAdminInterface : !!inGroups.amplify_groups[AmplifyGroups.AST_ADMIN_INTERFACE]}});
                } else {
                    console.log("Failed to verify in ampifly/cognito groups: ", result);
                }
            } catch (e) {
                console.log("Failed to verify in ampifly/cognito groups: ", e);
            }
        }

        const syncConversations = async (conversations: Conversation[], folders: FolderInterface[]) => {
            try {
                const allRemoteConvs = await fetchAllRemoteConversations();
                if (allRemoteConvs) return updateWithRemoteConversations(allRemoteConvs, conversations, folders, dispatch);
            } catch (e) {
                console.log("Failed to sync cloud conversations: ", e);
            }
            console.log("Failed to sync cloud conversations.");
            return {newfolders: []};
        }


        const syncGroups = async () => {
            console.log("Syncing Groups...");
            try {
                const userGroups = await fetchAstAdminGroups();
                if (userGroups.success) {
                    const groupData = contructGroupData(userGroups.data);
                    dispatch({ field: 'groups', value: groupData.groups});
                    return groupData;
                } 
            } catch (e) {
                console.log("Failed to import group data: ", e);
            }
            console.log("Failed to import group data.");
            return {groups: [], groupFolders: [] as FolderInterface[], groupPrompts: [] as Prompt[]};
        }


        const fetchPrompts = () => {
            console.log("Fetching Base Prompts...");
            const updatedFolders:FolderInterface[] = [...foldersRef.current.filter((f:FolderInterface) => !isBaseFolder(f.id) && !isOutDatedBaseFolder(f.id)),
                                                      ...basePrompt.folders];
            const updatedPrompts: Prompt[] =  [...promptsRef.current.filter((p: Prompt) => !p.folderId || (!isBaseFolder(p.folderId) && !isOutDatedBaseFolder(p.folderId))),
                                               ...basePrompt.prompts]
            
                    // currently we have no base conversations 
            return {updatedConversations: conversationsRef.current, updatedFolders, updatedPrompts};
        }

        // return list of assistants 
        const fetchAssistants = async (promptList:Prompt[]) => {
            console.log("Fetching Assistants...");
            try {
                const assistants = await listAssistants();
                if (assistants) return syncAssistants(assistants, promptList);
            } catch (e) {
                console.log("Failed to  list assistants: ", e);
            }
            console.log("Failed to list assistants.");
            return [];

        }

        // On Load Data
        const handleOnLoadData = async () => {
            // new basePrompts no remote call 
            let { updatedConversations, updatedFolders, updatedPrompts} = fetchPrompts();

            let assistantLoaded = false;
            let groupsLoaded = false;

            const checkAndFinalizeUpdates = () => {
                if (assistantLoaded && groupsLoaded) {

                    const containsAssistantCreator = false;
                    if (!containsAssistantCreator) updatedPrompts.push()
                    // Only dispatch when both operations have completed
                    dispatch({ field: 'prompts', value: updatedPrompts });
                    dispatch({ field: 'syncingPrompts', value: false });
                    savePrompts(updatedPrompts);
                }
            }


            // Handle remote conversations
            if (featureFlags.storeCloudConversations) {
                syncConversations(updatedConversations, updatedFolders)
                    .then(cloudConversationsResult => {
                        // currently base prompts does not have conversations so we know we are done syncing at this point 
                        dispatch({field: 'syncingConversations', value: false});
                        const newCloudFolders = cloudConversationsResult.newfolders;
                        if (newCloudFolders.length > 0) {
                            const handleCloudFolderUpdate = () => {
                                updatedFolders = [...updatedFolders, ...cloudConversationsResult.newfolders];
                                dispatch({ field: 'folders', value: updatedFolders });
                                saveFolders(updatedFolders);
                                console.log('sync conversations complete');
                            };

                            // to avoid a race condition between this and groups folders. we need to updates folders after groups because sync conversations call will likely take longer in most cases
                            if (groupsLoaded) {
                                handleCloudFolderUpdate();
                            } else {
                                console.log("Waiting on group folders to update");
                                // Poll or wait until groups are loaded
                                const checkGroupsLoaded = setInterval(() => {
                                    if (groupsLoaded) {
                                        clearInterval(checkGroupsLoaded);
                                        handleCloudFolderUpdate();
                                        console.log("Syncing cloud conversation folders done");
                                    }
                                }, 100); // Check every 100 milliseconds
                            }
                        }
                        
                        console.log('sync conversations complete');
                    })
                    .catch(error => console.log("Error syncing conversations:", error));
            }

            // Fetch assistants
            fetchAssistants(updatedPrompts)
                    .then(assistantsResultPrompts => {
                        // assistantsResultPrompts includes both list assistants and imported assistants
                        updatedPrompts = [...updatedPrompts.filter((p:Prompt) => !isAssistant(p) || (isAssistant(p) && p.groupId)),
                                            ...assistantsResultPrompts];
                        // dispatch({ field: 'prompts', value: updatedPrompts});
                        console.log('sync assistants complete');
                        assistantLoaded = true;
                        checkAndFinalizeUpdates(); 
                    })
                    .catch(error => {
                        console.log("Error fetching assistants:", error);
                        assistantLoaded = true;
                    });
                    
            // Sync groups
            syncGroups()
                .then(groupsResult => {
                    updatedFolders = [...updatedFolders.filter((f:FolderInterface) => !f.isGroupFolder), 
                                        ...groupsResult.groupFolders]
                    dispatch({field: 'folders', value: updatedFolders});
                    saveFolders(updatedFolders);

                    let groupPrompts = groupsResult.groupPrompts;
                    if (!featureFlags.apiKeys) groupPrompts = groupPrompts.filter(prompt =>{
                                                    const tags = prompt.data?.tags;
                                                    return !(
                                                        tags && 
                                                        (tags.includes(ReservedTags.ASSISTANT_API_KEY_MANAGER) || tags.includes(ReservedTags.ASSISTANT_API_HELPER))
                                                    );
                                                });
                    updatedPrompts = [...updatedPrompts.filter((p : Prompt) => !p.groupId ), 
                                        ...groupPrompts];
                    
                    groupsLoaded = true;
                    console.log('sync groups complete');
                    checkAndFinalizeUpdates();
                    
                })
                .catch(error => {
                    console.log("Error syncing groups:", error); 
                    groupsLoaded = true;
                });

        }


        if (user && user.email && initialRender) {
            setInitialRender(false);
            // independent function call high priority
            fetchAccounts();  // fetch accounts for chatting charging
            fetchSettings(); // fetch user settinsg
            fetchInAmpCognGroup();  // updates ast admin interface featureflag
            if (featureFlags.artifacts) fetchArtifacts(); // fetch artifacts 

            //Conversation, prompt, folder dependent calls
            handleOnLoadData();
        }
    
    }, [user]);


    // ON LOAD --------------------------------------------

    useEffect(() => {
        const settings = getSettings(featureFlags);

        //Changed 3/6/2025 to ensure default mode is dark
        if (settings.theme) {
            dispatch({
                field: 'lightMode',
                value: 'dark',
            });
        }

        const workspaceMetadataStr = localStorage.getItem('workspaceMetadata');
        if (workspaceMetadataStr) {
            dispatch({ field: 'workspaceMetadata', value: JSON.parse(workspaceMetadataStr) });
        }

        if (window.innerWidth < 640) {
            dispatch({ field: 'showChatbar', value: false });
            dispatch({ field: 'showPromptbar', value: false });
        }

        const pluginLoc = localStorage.getItem('pluginLocation');
        if (pluginLoc) {
            dispatch({ field: 'pluginLocation', value: JSON.parse(pluginLoc) });
        }

        const showChatbar = localStorage.getItem('showChatbar');
        if (showChatbar) {
            dispatch({ field: 'showChatbar', value: showChatbar === 'true' });
        }

        const showPromptbar = localStorage.getItem('showPromptbar');
        if (showPromptbar) {
            dispatch({ field: 'showPromptbar', value: showPromptbar === 'true' });
        }

        const storageSelection = localStorage.getItem('storageSelection');
        if (storageSelection) {
            dispatch({field: 'storageSelection', value: storageSelection});
        }

        const prompts = localStorage.getItem('prompts');
        const promptsParsed = JSON.parse(prompts ? prompts : '[]')
        if (prompts) {
            dispatch({ field: 'prompts', value: promptsParsed });
        }

        const workflows = localStorage.getItem('workflows');
        if (workflows) {
            dispatch({ field: 'workflows', value: JSON.parse(workflows) });
        }

        const folders = localStorage.getItem('folders');
        const foldersParsed = JSON.parse(folders ? folders : '[]')
        if (folders) {
            // for older folders with no date, if it can be transform to the correct format then we add the date attribte
            let updatedFolders:FolderInterface[] = foldersParsed.map((folder:FolderInterface) => {
                                        return "date" in folder ? folder : addDateAttribute(folder);
                                    })
            // Make sure the "assistants" folder exists and create it if necessary
            const assistantsFolder = updatedFolders.find((f:FolderInterface) => f.id === "assistants");
            if (!assistantsFolder) updatedFolders.push( baseAssistantFolder );
            
            dispatch({ field: 'folders', value: updatedFolders});
        }


        // Create a string for the current date like Oct-18-2021
        const dateName = getDateName();

        const conversationHistory = localStorage.getItem('conversationHistory');
        let conversations: Conversation[] = JSON.parse(conversationHistory ? conversationHistory : '[]');
        //ensure all conversation messagea are compressed 
        conversations = compressAllConversationMessages(conversations);

        // call fetach all conversations 
        const lastConversation: Conversation | null = (conversations.length > 0) ? conversations[conversations.length - 1] : null;
        const lastConversationFolder: FolderInterface | null = lastConversation && foldersParsed ? foldersParsed.find((f: FolderInterface) => f.id === lastConversation.folderId) : null;

        let selectedConversation: Conversation | null = lastConversation ? { ...lastConversation } : null;

        if (!lastConversation || lastConversation.name !== 'New Conversation' ||
            (lastConversationFolder && lastConversationFolder.name !== dateName)) {

            // See if there is a folder with the same name as the date
            let folder = foldersParsed.find((f: FolderInterface) => f.name === dateName);
            if (!folder) {
                const newFolder: FolderInterface = {
                    id: uuidv4(),
                    date: getDate(),
                    name: dateName,
                    type: "chat"
                };

                folder = newFolder;
                const updatedFolders = [...foldersParsed, newFolder];

                dispatch({ field: 'folders', value: updatedFolders });
                saveFolders(updatedFolders);
            }

            //new conversation on load 
            const newConversation: Conversation = {
                id: uuidv4(),
                name: t('New Conversation'),
                messages: [],
                model: Models[defaultModelId],
                prompt: DEFAULT_SYSTEM_PROMPT,
                temperature: lastConversation?.temperature ?? DEFAULT_TEMPERATURE,
                folderId: folder.id,
                promptTemplate: null,
                isLocal: getIsLocalStorageSelection(storageSelection)
            };

            if (isRemoteConversation(newConversation)) uploadConversation(newConversation, foldersRef.current);
            // Ensure the new conversation is added to the list of conversationHistory
            conversations.push(newConversation);

            selectedConversation = { ...newConversation };

        }

        dispatch({ field: 'selectedConversation', value: selectedConversation });
        localStorage.setItem('selectedConversation', JSON.stringify(selectedConversation));

        if (conversationHistory) {
            const cleanedConversationHistory = cleanConversationHistory(conversations);

            dispatch({ field: 'conversations', value: cleanedConversationHistory });
            saveConversations(cleanedConversationHistory)
        }

        dispatch({
            field: 'conversationStateId',
            value: 'post-init',
        });
    }, [
        defaultModelId,
        dispatch,
    ]);

    const [preProcessingCallbacks, setPreProcessingCallbacks] = useState([]);
    const [postProcessingCallbacks, setPostProcessingCallbacks] = useState([]);

    const federatedSignOut = async () => {

        await signOut();
        // signOut only signs out of Auth.js's session
        // We need to log out of Cognito as well
        // Federated signout is currently not supported.
        // Therefore, we use a workaround: https://github.com/nextauthjs/next-auth/issues/836#issuecomment-1007630849
        const signoutRedirectUrl = `${window.location.protocol}//${window.location.hostname}${window.location.port ? `:${window.location.port}` : ''}`;

        window.location.replace(

            `${cognitoDomain}/logout?client_id=${cognitoClientId}&logout_uri=${encodeURIComponent(signoutRedirectUrl)}`

        );
    };

    const getName = (email?: string | null) => {
        if (!email) return "Anonymous";

        const name = email.split("@")[0];

        // Split by dots and capitalize each word
        const nameParts = name.split(".");
        const capitalizedParts = nameParts.map((part) => {
            return part.charAt(0).toUpperCase() + part.slice(1);
        });

        return capitalizedParts.join(" ").slice(0, 28);
    }

    const addPreProcessingCallback = useCallback((callback: Processor) => {
        console.log("Proc added");
        //setPreProcessingCallbacks(prev => [...prev, callback]);
    }, []);

    const removePreProcessingCallback = useCallback((callback: Processor) => {
        setPreProcessingCallbacks(prev => prev.filter(c => c !== callback));
    }, []);

    const addPostProcessingCallback = useCallback((callback: Processor) => {
        //setPostProcessingCallbacks(prev => [...prev, callback]);
    }, []);

    const removePostProcessingCallback = useCallback((callback: Processor) => {
        setPostProcessingCallbacks(prev => prev.filter(c => c !== callback));
    }, []);

    const handleScroll = (event: any) => {
        const scrollableElement = event.currentTarget;
        const hasScrollableContent = scrollableElement.scrollHeight > scrollableElement.clientHeight;
        const isAtBottom = scrollableElement.scrollHeight - scrollableElement.scrollTop <= scrollableElement.clientHeight + 1;
        if (hasScrollableContent && isAtBottom) {
            dispatch({ field: 'hasScrolledToBottom', value: true });
        } else if (!hasScrollableContent) {
            dispatch({ field: 'hasScrolledToBottom', value: true });
        }
    };

    const checkScrollableContent = () => {
        const scrollableElement = document.querySelector('.data-disclosure');
        if (scrollableElement) {
            const hasScrollableContent = scrollableElement.scrollHeight > scrollableElement.clientHeight;
            dispatch({ field: 'hasScrolledToBottom', value: !hasScrollableContent });
        }
    };

    useEffect(() => {
        if (featureFlags.dataDisclosure && window.location.hostname !== 'localhost') {
            const fetchDataDisclosureDecision = async () => {
                const { hasAcceptedDataDisclosure } = contextValue.state;
                if (user?.email && (!hasAcceptedDataDisclosure)) {
                    try {
                        const decision = await checkDataDisclosureDecision(user?.email);
                        const decisionBodyObject = JSON.parse(decision.item.body);
                        const decisionValue = decisionBodyObject.acceptedDataDisclosure;
                        // console.log("Decision: ", decisionValue);
                        dispatch({ field: 'hasAcceptedDataDisclosure', value: decisionValue });
                        if (!decisionValue) { // Fetch the latest data disclosure only if the user has not accepted it
                            const latestDisclosure = await getLatestDataDisclosure();
                            const latestDisclosureBodyObject = JSON.parse(latestDisclosure.item.body);
                            const latestDisclosureUrlPDF = latestDisclosureBodyObject.pdf_pre_signed_url;
                            const latestDisclosureHTML = latestDisclosureBodyObject.html_content;
                            dispatch({ field: 'latestDataDisclosureUrlPDF', value: latestDisclosureUrlPDF });
                            dispatch({ field: 'latestDataDisclosureHTML', value: latestDisclosureHTML });

                            checkScrollableContent();
                        }
                    } catch (error) {
                        console.error('Failed to check data disclosure decision:', error);
                        dispatch({ field: 'hasAcceptedDataDisclosure', value: false });
                    }
                }
            };

            if (user?.email) fetchDataDisclosureDecision();
        }
    }, [user,
        hasAcceptedDataDisclosure,
        featureFlags.dataDisclosure]);

    if (session) {
        if (featureFlags.dataDisclosure && window.location.hostname !== 'localhost') {
            if (hasAcceptedDataDisclosure === null) {
                return (
                    <main className={`main-1 flex h-screen w-screen flex-col text-sm text-white dark:text-white ${lightMode}`}>
                        <div className="flex flex-col items-center justify-center min-h-screen text-center text-white dark:text-white">
                            <Loader />
                            <h1 className="mb-4 text-2xl font-bold">Loading...</h1>
                        </div>
                    </main>
                );
            } else if (!hasAcceptedDataDisclosure) {
                return (
                    <main className={`main-2 flex h-screen w-screen flex-col text-sm ${lightMode}`}>
                        <div className="flex flex-col items-center justify-center min-h-screen text-center dark:bg-[#444654] bg-white dark:text-white text-black">
                            <h1 className="text-2xl font-bold dark:text-white">Amplify Data Disclosure Agreement</h1>
                            <a href={latestDataDisclosureUrlPDF} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', marginBottom: '10px' }}>Download the data disclosure agreement</a>
                            {latestDataDisclosureHTML ? (
                                <div
                                    className="data-disclosure dark:bg-[#343541] bg-gray-50 dark:text-white text-black text-left"
                                    style={{
                                        overflowY: 'scroll',
                                        border: '1px solid #ccc',
                                        padding: '20px',
                                        marginBottom: '10px',
                                        height: '500px',
                                        width: '30%',
                                    }}
                                    onScroll={handleScroll}
                                    dangerouslySetInnerHTML={{ __html: latestDataDisclosureHTML }}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center" style={{ height: '500px', width: '30%' }}>
                                    <Loader />
                                    <p className="mt-4">Loading agreement...</p>
                                </div>
                            )}
                            <input
                                type="email"
                                placeholder="Enter your email"
                                value={inputEmail}
                                onChange={(e) => dispatch({ field: 'inputEmail', value: e.target.value })}
                                style={{
                                    marginBottom: '10px',
                                    padding: '4px 10px',
                                    borderRadius: '5px',
                                    border: '1px solid #ccc',
                                    color: 'black',
                                    backgroundColor: 'white',
                                    width: '300px',
                                    boxSizing: 'border-box',
                                }}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        if (user && user.email) {
                                            if (inputEmail.toLowerCase() === user.email.toLowerCase()) {
                                                if (hasScrolledToBottom) {
                                                    saveDataDisclosureDecision(user.email, true);
                                                    dispatch({ field: 'hasAcceptedDataDisclosure', value: true });
                                                } else {
                                                    alert('You must scroll to the bottom of the disclosure before accepting.');
                                                }
                                            } else {
                                                alert('The entered email does not match your account email.');
                                            }
                                        } else {
                                            console.error('Session or user is undefined.');
                                        }
                                    }
                                }}
                            />
                            <button
                                onClick={() => {
                                    if ( user && user.email ) {
                                        if (inputEmail.toLowerCase() === user.email.toLowerCase()) {
                                            if (hasScrolledToBottom) {
                                                saveDataDisclosureDecision(user.email, true);
                                                dispatch({ field: 'hasAcceptedDataDisclosure', value: true });
                                            } else {
                                                alert('You must scroll to the bottom of the disclosure before accepting.');
                                            }
                                        } else {
                                            alert('The entered email does not match your account email.');
                                        }
                                    } else {
                                        console.error('Session or user is undefined.');
                                    }
                                }}
                                style={{
                                    backgroundColor: 'white',
                                    color: 'black',
                                    fontWeight: 'bold',
                                    padding: '4px 20px',
                                    borderRadius: '5px',
                                    border: '1px solid #ccc',
                                    cursor: 'pointer',
                                    transition: 'background-color 0.3s ease-in-out',
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#48bb78'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                            >
                                Accept
                            </button>
                        </div>
                    </main>
                );
            }
        }

        // @ts-ignore
        return (
            <HomeContext.Provider
                value={{
                    ...contextValue,
                    handleNewConversation,
                    handleStopConversation,
                    shouldStopConversation,
                    handleCreateFolder,
                    handleDeleteFolder,
                    handleUpdateFolder,
                    handleSelectConversation,
                    handleUpdateConversation,
                    handleUpdateSelectedConversation, 
                    preProcessingCallbacks,
                    postProcessingCallbacks,
                    addPreProcessingCallback,
                    removePreProcessingCallback,
                    addPostProcessingCallback,
                    removePostProcessingCallback,
                    clearWorkspace,
                    handleAddMessages,
                    setLoadingMessage
                }}
            >
                <Head>
                    <title>ChattUTC</title>
                    <meta name="description" content="ChatGPT but better." />
                    <meta
                        name="viewport"
                        content="height=device-height ,width=device-width, initial-scale=1, user-scalable=no"
                    />
                    <link rel="icon" href="/favicon.ico" />
                </Head>
                {selectedConversation && (
                    <main
                        className={`main-3 flex h-screen w-screen flex-col text-sm text-white dark:text-white ${lightMode}`}
                    >
                    <div className="w-full h-full bg-[url('/chattutc-light-bg.jpg')] dark:bg-[url('/chattutc-darkest-bg.jpg')] bg-cover bg-right">
                        <div className="fixed top-0 w-full z-1">
                            <Navbar
                                selectedConversation={selectedConversation}
                                onNewConversation={handleNewConversation}
                            />
                        </div>

                        <div className="flex h-full w-full pt-[48px] sm:pt-0">

                            <TabSidebar
                                side={"left"}
                                footerComponent={
                                    <div className="m-0 p-0 border-t dark:border-white/20 pt-1 text-sm">
                                        <button className="dark:text-white" title="Sign Out" onClick={() => {
                                            const goLogout = async () => {
                                                await federatedSignOut();
                                            };
                                            goLogout();
                                        }}>

                                            <div className="flex items-center">
                                                <IconLogout className="m-2" />
                                                <span>{isLoading ? 'Loading...' : getName(user?.email) ?? 'Unnamed user'}</span>
                                            </div>

                                        </button>

                                    </div>
                                }
                            >
                                <Tab icon={<IconMessage />} title="Chats"><Chatbar /></Tab>
                                <Tab icon={<IconShare />} title="Share"><SharedItemsList /></Tab>
                                <Tab icon={<IconTournament />} title="Workspaces"><WorkspaceList /></Tab>
                                <Tab icon={<IconSettings />} title="Settings"><SettingsBar /></Tab>
                            </TabSidebar>

                            <div className="flex flex-1 z-1">
                                {page === 'chat' && (
                                    <Chat stopConversationRef={stopConversationRef} />
                                )}
                                {page === 'market' && (
                                    <Market items={[
                                        // {id: "1", name: "Item 1"},
                                    ]} />
                                )}
                                {page === 'home' && (
                                    <MyHome />
                                )}
                            </div>


                            <TabSidebar
                                side={"right"}
                            >
                                <Tab icon={<Icon3dCubeSphere />}><Promptbar /></Tab>
                                {/*<Tab icon={<IconBook2/>}><WorkflowDefinitionBar/></Tab>*/}
                            </TabSidebar>

                        </div>
                        <LoadingDialog open={!!loadingMessage} message={loadingMessage}/>
                        {/* <LoadingDialog open={loadingAmplify} message={"Setting Up ChattUTC..."}/> */}
                    </div>
                    </main>
                )}

            </HomeContext.Provider>
        );
    } else if (isLoading) {
        return (
            <main
                className={`main-4 flex h-screen w-screen flex-col text-sm text-white dark:text-white ${lightMode}`}
            >
                <div
                    className="flex flex-col items-center justify-center min-h-screen text-center text-white dark:text-white">
                    <Loader />
                    <h1 className="mb-4 text-2xl font-bold">
                        Loading...
                    </h1>

                    {/*<progress className="w-64"/>*/}
                </div>
            </main>);
    } else {
        return (
            <main
                className={`main-5 flex h-screen w-screen flex-col text-sm text-white dark:text-white ${lightMode}`}
            >
                <div
                    className="flex flex-col items-center justify-center min-h-screen text-center text-white dark:text-white">
                    <img src="/ai-stripes-animation.gif" alt='atom animation' className="w-5/6 mb-16 sm:w-1/2"></img>
                    <svg className="utc-logo" viewBox="0 0 325 39.4">
                    <g>
                        <path fill="#fff" d="M57.9,8.1c0,1.2,0.1,1.4,0.4,1.8c0.3,0.4,0.7,0.6,1.3,0.6c0.2,0,0.3,0.1,0.3,0.2c0,0.2,0,0.2-0.2,0.2
                    c0,0,0,0-0.8,0c-1-0.1-1-0.1-1.3-0.1c-0.4,0-0.5,0-1.4,0.1l-1,0.1c-0.2,0-0.3,0-0.4,0c-0.1,0-0.2-0.1-0.2-0.2
                    c0-0.2,0.1-0.3,0.4-0.3c1-0.1,1.3-0.7,1.2-1.8V2.1c0-0.7-0.1-0.8-0.8-0.8c-1.1,0-1.8,0.1-2.1,0.3c-0.4,0.2-0.5,0.4-0.7,1.3
                    c-0.1,0.4-0.2,0.5-0.3,0.5c-0.1,0-0.2-0.1-0.2-0.2c0,0,0,0,0-0.4c0-0.2,0-0.2,0.1-0.9c0-0.2,0.1-0.5,0.1-0.7c0-0.2,0-0.3,0.1-0.5
                    c0-0.2,0.1-0.3,0.3-0.3c0,0,0.2,0,0.3,0c0.1,0,0.5,0,0.8,0l1.6,0c1.5,0,1.5,0,1.9,0c0.9,0,2.9,0,3.8-0.1l0.5,0c0.4,0,0.4,0,0.5,0.9
                    c0,0.4,0.1,0.6,0.1,0.6C62,2.2,62,2.6,62,2.7c0,0.2-0.1,0.2-0.2,0.2c-0.1,0-0.2-0.1-0.3-0.3c-0.1-0.4-0.4-0.8-0.7-1.1
                    c-0.3-0.2-0.6-0.3-1.3-0.3c-1.5,0-1.7,0.1-1.7,1.1V8.1z"/>
                        <path fill="#fff" d="M67.4,5.8c-0.7,0-0.8,0.1-0.8,0.9v1.9c0,1.4,0.4,2,1.5,2c0.2,0,0.3,0,0.3,0.2c0,0.2-0.1,0.2-0.4,0.2
                    c-0.1,0-0.3,0-0.5,0c-0.5-0.1-1.3-0.1-1.6-0.1c-0.3,0-0.7,0-1.8,0.1h-0.1c-0.1,0-0.2-0.1-0.2-0.3c0-0.1,0-0.2,0.2-0.2
                    c0.4-0.1,0.8-0.4,0.9-0.9c0-0.2,0-0.2,0.1-1.2V2.4c0-1-0.3-1.4-1.4-1.5c-0.2,0-0.2-0.1-0.2-0.2c0-0.2,0.1-0.3,0.3-0.3
                    c0.1,0,0.3,0,0.5,0c0.3,0.1,1,0.1,1.5,0.1c0.1,0,0.1,0,1.1-0.1c0.3,0,0.8-0.1,0.9-0.1c0.2,0,0.3,0.1,0.3,0.2c0,0.1-0.1,0.2-0.2,0.2
                    c-0.6,0.1-0.9,0.4-0.9,1.1v2c0,1,0,1,0.8,1H71c0.6,0,0.7-0.2,0.7-1.2V2.4c0-1-0.3-1.4-1.4-1.5c-0.2,0-0.2-0.1-0.2-0.2
                    c0-0.2,0.1-0.3,0.3-0.3c0.1,0,0.3,0,0.5,0c0.4,0.1,1,0.1,1.6,0.1c0.1,0,0.5,0,1-0.1c0.3,0,0.7-0.1,0.8-0.1c0.2,0,0.3,0.1,0.3,0.2
                    c0,0.1-0.1,0.2-0.2,0.2c-0.6,0.1-0.9,0.4-0.9,1.1v6.6c0,1.4,0.4,2,1.5,2c0.2,0,0.3,0,0.3,0.2c0,0.2-0.1,0.2-0.4,0.2
                    c-0.1,0-0.3,0-0.5,0c-0.5-0.1-1.3-0.1-1.6-0.1c-0.3,0-0.7,0-1.8,0.1h-0.1c-0.1,0-0.2-0.1-0.2-0.3c0-0.1,0-0.2,0.2-0.2
                    c0.4-0.1,0.8-0.4,0.9-0.9c0-0.2,0-0.2,0.1-1.2V6.8c0-1-0.1-1.1-0.7-1.1H67.4z"/>
                        <path fill="#fff" d="M80,3.9C80,4.9,80,5,80.6,5l0.6,0h0.6c0.6,0,1-0.3,1.4-1.2c0-0.1,0.1-0.2,0.2-0.2s0.2,0.1,0.2,0.2
                    c0,0.1,0,0.2,0,0.4c0,0.1,0,0.2,0,0.4c0,0.2,0,0.2,0.1,1.1c0,0.4,0,1,0,1.4c0,0.1,0,0.2-0.2,0.2c-0.1,0-0.2-0.1-0.2-0.3
                    c-0.3-1.2-0.5-1.3-2.4-1.3c-0.5,0-0.7,0-0.8,0.3C80,6.2,80,6.4,80,7.5v0.7c0,0.6,0.1,1.3,0.2,1.6c0.2,0.5,0.4,0.6,0.8,0.6
                    c1.4,0,2.5-0.3,3.3-0.9c0.3-0.3,0.7-0.7,0.8-1c0-0.1,0.1-0.1,0.1-0.1c0.1,0,0.2,0.1,0.2,0.2c0,0.5-0.3,1.3-0.5,1.7
                    c-0.5,0.6-1,0.9-2,0.9c-0.5,0-0.5,0-2-0.1c-0.3,0-0.7,0-1.3,0c-0.5,0-0.6,0-1.8,0.1l-0.5,0c-0.1,0-0.2,0-0.2-0.2
                    c0-0.1,0-0.2,0.2-0.2c0.7-0.2,0.9-0.7,0.9-2.1V2.5c0-1.2-0.3-1.4-1.4-1.6c-0.2,0-0.2-0.1-0.2-0.2c0-0.1,0.1-0.2,0.2-0.2l0.3,0
                    l0.4,0c1.3,0,2.1,0,3.9,0c0.7,0,2.5,0,2.8-0.1h0.1c0.2,0,0.2,0.1,0.2,0.3c0,0.2,0,0.4,0,0.6c0.1,0.7,0.1,0.8,0.1,1
                    c0,0.4-0.1,0.6-0.3,0.6c-0.1,0-0.1-0.1-0.2-0.3c0-1-0.8-1.5-2.4-1.4H81c-1,0-1.1,0.1-1.1,1.1V3.9z"/>
                        <path fill="#fff" d="M93.1,2.2c0-0.9-0.2-1.1-1.3-1.3c-0.2,0-0.3-0.1-0.3-0.2c0-0.1,0.1-0.2,0.2-0.2c0.1,0,0.2,0,0.3,0
                    c0.8,0.1,1,0.1,1.5,0.1c0.5,0,1,0,1.6-0.1c0.3,0,0.4,0,0.5,0c0.3,0,0.4,0,0.4,0.2c0,0.2,0,0.2-0.3,0.3C95.4,1,95.3,1,95.2,1.3
                    C95.1,1.4,95,1.7,95,2.1c0,0.7-0.1,1.3-0.1,2c0,3.7,0,3.8,0.4,4.6c0.5,1.1,1.7,1.8,3.1,1.8c0.7,0,1.5-0.3,2.1-0.7
                    c0.8-0.6,1.2-1.6,1.3-3.5c0-0.7,0-1.3,0-2.2c0-1.2,0-1.7-0.1-2.1c-0.1-0.6-0.7-1-1.4-1c-0.2,0-0.3-0.1-0.3-0.2c0-0.1,0-0.2,0.1-0.2
                    c0,0,0.1,0,0.2,0c0.1,0,1.2,0.1,1.5,0.1c0.2,0,0.8,0,1.3-0.1c0.1,0,0.2,0,0.2,0c0.1,0,0.2,0.1,0.2,0.2c0,0.1,0,0.2-0.5,0.2
                    c-0.4,0.1-0.6,0.4-0.6,1.2l0,0.8c0,0.6,0,2.4-0.1,3.3c-0.1,1.8-0.5,3.1-1.4,3.8c-0.8,0.8-2,1.2-3.4,1.2c-1.4,0-2.6-0.4-3.3-1
                    c-0.8-0.7-1.1-2-1.1-3.7l0.1-2.8L93.1,2.2z"/>
                        <path fill="#fff" d="M113.5,6.8c0.6,0.7,0.8,0.9,0.9,0.9c0.1,0,0.1-0.1,0.2-0.2c0-0.1,0.1-2.7,0.1-3.6c0-2.3-0.4-2.9-1.8-3.1
                    c-0.2,0-0.3-0.1-0.3-0.2c0-0.1,0.1-0.2,0.2-0.2c0.2,0,0.3,0,0.9,0.1c0.2,0,0.5,0,0.6,0c0.3,0,1,0,1.7-0.1c0.1,0,0.2,0,0.3,0
                    c0.1,0,0.2,0.1,0.2,0.2c0,0.2-0.1,0.2-0.3,0.3c-0.7,0.2-1,0.8-1,2.1l-0.1,4.8c0,0.9,0,0.9,0,1.2c0,0.7,0,1.5,0,1.7v0.1
                    c0,0.1,0,0.2-0.2,0.2c-0.1,0-0.2-0.1-0.3-0.2l-7-7.7c-0.2-0.2-0.2-0.2-0.3-0.2c-0.1,0-0.2,0.1-0.2,0.6v3c0,3.6,0.2,3.9,1.7,4.1
                    c0.2,0,0.2,0.1,0.2,0.2c0,0.1-0.1,0.2-0.2,0.2c0,0-0.2,0-0.3,0c-0.4-0.1-1-0.1-1.4-0.1c-0.4,0-1.1,0-1.4,0.1c-0.2,0-0.3,0-0.4,0
                    c-0.1,0-0.2-0.1-0.2-0.2c0-0.1,0-0.2,0.2-0.2c1-0.4,1-0.6,1.1-3.9V5.8V3.4c0-1.5-0.6-2.4-1.7-2.5c-0.2,0-0.2-0.1-0.2-0.2
                    c0-0.1,0.1-0.2,0.2-0.2l0.5,0c0.6,0,1.1,0,1.6-0.1c0.2,0,0.3,0,0.4,0c0.3,0,0.3,0,0.8,0.5c0.1,0.1,0.1,0.1,0.6,0.7
                    c0.3,0.4,0.4,0.5,0.5,0.6L113.5,6.8z"/>
                        <path fill="#fff" d="M121.4,8.3c0,1.7,0.3,2.2,1.5,2.3c0.3,0,0.4,0,0.4,0.2c0,0.2-0.1,0.2-0.5,0.2c-0.2,0-0.4,0-0.6,0
                    c-0.8-0.1-1.1-0.1-1.6-0.1c-0.5,0-0.9,0-1.2,0.1c-0.2,0-0.5,0.1-0.5,0.1c-0.2,0-0.2-0.1-0.2-0.2c0-0.1,0-0.1,0.2-0.2
                    c0.3,0,0.7-0.4,0.8-0.7c0.1-0.3,0.1-0.4,0.1-1.5V8.1V2.7c0-1.2-0.2-1.5-1.1-1.7c-0.5-0.1-0.6-0.1-0.6-0.3c0-0.1,0.1-0.2,0.2-0.2 c0.1,0,0.2,0,0.4,0.1c0.2,0,0.5,0.1,0.9,0.1c0.4,0,0.7,0,1.6-0.1c0.5,0,0.9-0.1,1.2-0.1c0.2,0,0.2,0,0.2,0.2c0,0.2,0,0.2-0.2,0.3
                    c-0.8,0.2-0.9,0.3-0.9,1.5V8.3z"/>
                        <path fill="#fff" d="M130,8.5c0.1,0.2,0.1,0.3,0.2,0.3c0.1,0,0.1,0,0.2-0.2l1.7-3.8c0.5-1.1,0.8-2.2,0.8-2.7c0-0.3-0.2-0.7-0.4-0.9
                    c-0.2-0.2-0.4-0.3-0.9-0.3c-0.2,0-0.3-0.1-0.3-0.2c0-0.1,0.1-0.2,0.2-0.2c0.1,0,0.1,0,1.2,0.1c0.4,0,0.6,0,0.8,0 c0.3,0,0.7,0,1.2-0.1c0.3,0,0.3,0,0.3,0c0.1,0,0.1,0.1,0.1,0.2c0,0.1-0.1,0.2-0.2,0.2c-0.7,0.2-0.8,0.2-2.7,4.6l-2,4.4
                    c-0.3,0.5-0.4,0.9-0.5,1c-0.1,0.3-0.2,0.3-0.4,0.3c-0.1,0-0.1,0-0.4-0.6l-0.2-0.5L127.2,6c-0.2-0.4-0.3-0.8-0.5-1.2 c-0.1-0.3-0.4-0.9-0.6-1.5c-0.7-1.8-0.9-2.2-1.7-2.4c-0.3-0.1-0.3-0.1-0.3-0.3c0-0.1,0.1-0.2,0.2-0.2l0.2,0c0.2,0,1.8,0.1,2.1,0.1
                    c0.4,0,0.5,0,0.9,0c0.3,0,0.6,0,0.7,0c0.1,0,0.2,0.1,0.2,0.2c0,0.1-0.1,0.2-0.3,0.2c-0.4,0.1-0.6,0.3-0.6,0.7 c0,0.5,0.2,1.1,0.8,2.7L130,8.5z"/>
                        <path fill="#fff" d="M139.7,3.9c0,1,0.1,1.1,0.6,1.1l0.6,0h0.6c0.6,0,1-0.3,1.4-1.2c0-0.1,0.1-0.2,0.2-0.2c0.1,0,0.2,0.1,0.2,0.2
                    c0,0.1,0,0.2,0,0.4c0,0.1,0,0.2,0,0.4c0,0.2,0,0.2,0.1,1.1c0,0.4,0,1,0,1.4c0,0.1,0,0.2-0.2,0.2c-0.1,0-0.2-0.1-0.2-0.3
                    c-0.3-1.2-0.5-1.3-2.4-1.3c-0.5,0-0.7,0-0.8,0.3c-0.1,0.2-0.1,0.4-0.1,1.5v0.7c0,0.6,0.1,1.3,0.2,1.6c0.2,0.5,0.4,0.6,0.8,0.6
                    c1.4,0,2.5-0.3,3.3-0.9c0.3-0.3,0.7-0.7,0.8-1c0-0.1,0.1-0.1,0.1-0.1c0.1,0,0.2,0.1,0.2,0.2c0,0.5-0.3,1.3-0.5,1.7
                    c-0.5,0.6-1,0.9-2,0.9c-0.5,0-0.5,0-2-0.1c-0.3,0-0.7,0-1.3,0c-0.5,0-0.6,0-1.8,0.1l-0.5,0c-0.1,0-0.2,0-0.2-0.2
                    c0-0.1,0-0.2,0.2-0.2c0.7-0.2,0.9-0.7,0.9-2.1V2.5c0-1.2-0.3-1.4-1.4-1.6c-0.2,0-0.2-0.1-0.2-0.2c0-0.1,0.1-0.2,0.2-0.2l0.3,0
                    l0.4,0c1.3,0,2.1,0,3.9,0c0.7,0,2.5,0,2.8-0.1h0.1c0.2,0,0.2,0.1,0.2,0.3c0,0.2,0,0.4,0,0.6c0.1,0.7,0.1,0.8,0.1,1
                    c0,0.4-0.1,0.6-0.3,0.6c-0.1,0-0.1-0.1-0.2-0.3c0-1-0.8-1.5-2.4-1.4h-0.7c-1,0-1.1,0.1-1.1,1.1V3.9z"/>
                        <path fill="#fff" d="M149.9,4.4c0,0.6,0,0.6,0.1,0.8c0.1,0.2,0.2,0.2,0.6,0.2c1.9,0,2,0,2.3-0.4c0.4-0.3,0.6-0.8,0.6-1.3
                    c0-1.6-1.1-2.7-2.7-2.7c-0.7,0-0.9,0.2-0.9,1V4.4z M149.9,8c0,2,0.2,2.4,1.3,2.6c0.2,0,0.3,0.1,0.3,0.3c0,0.2-0.1,0.2-0.3,0.2
                    l-0.3,0c-0.5,0-0.9-0.1-1.3-0.1c-0.5,0-0.8,0-1.5,0.1c-0.4,0-0.7,0.1-0.8,0.1c-0.2,0-0.3,0-0.3-0.2c0-0.1,0-0.2,0.2-0.2
                    c0.8-0.2,0.9-0.5,0.9-2V8.4V2.8c0-1.2-0.3-1.6-1.5-1.8c-0.2,0-0.3-0.1-0.3-0.3c0-0.1,0.1-0.2,0.2-0.2c0.1,0,0.2,0,0.3,0
                    c0.3,0,0.9,0.1,1.2,0.1c0.5,0,1.4,0,1.9-0.1c0.8-0.1,1.5-0.1,1.8-0.1c1.9,0,3.4,1.2,3.4,2.8c0,1-0.6,1.8-1.6,2.3
                    c-0.1,0-0.1,0.1-0.1,0.2c0,0,0,0.1,0.1,0.2c0,0,0.1,0.2,0.2,0.4c0.2,0.4,0.5,0.9,0.7,1.2l0.8,1.4c0.5,0.9,0.9,1.3,1.5,1.3
                    c0.1,0,0.2,0,0.3,0c0.1,0,0.1,0,0.2,0c0.1,0,0.1,0.1,0.1,0.2c0,0.3-1.1,0.8-1.7,0.8c-0.6,0-1.1-0.3-1.6-0.9c-0.3-0.4-1-1.7-1.6-2.8
                    c-0.4-0.9-0.6-1-0.9-1.2C151.3,6,151.1,6,150.3,6c-0.4,0-0.4,0-0.4,0.6V8z"/>
                        <path fill="#fff" d="M164.7,1.5c0,0.3,0,0.3,0.1,1.1c0,0.3,0.1,0.8,0.1,0.9c0,0.2-0.1,0.3-0.2,0.3c-0.1,0-0.2-0.1-0.2-0.3
                    c-0.3-1.5-1.7-2.6-3-2.6c-0.9,0-1.7,0.7-1.7,1.6c0,0.4,0.2,0.9,0.6,1.1c0.3,0.2,0.5,0.3,1.7,0.8c1.2,0.5,1.8,0.8,2.2,1.3
                    c0.5,0.5,0.9,1.4,0.9,2.2c0,0.9-0.3,1.7-1,2.3c-0.6,0.6-1.5,1-2.2,1c-0.4,0-1-0.1-1.7-0.4c-0.5-0.2-0.5-0.2-0.8-0.2
                    c-0.3-0.1-0.3-0.1-0.4-0.1c-0.1-0.1-0.1-0.1-0.1-0.4c0-0.2-0.1-0.7-0.2-1c-0.3-1-0.3-1-0.3-1.3c0-0.3,0.1-0.4,0.2-0.4
                    c0.1,0,0.1,0,0.2,0.2c0.5,1.7,1.9,3.1,3.2,3.1c1.1,0,2-0.9,2-2c0-0.5-0.2-1-0.6-1.3c-0.3-0.2-0.3-0.2-2-1c-1.3-0.6-1.7-0.9-2.2-1.3
                    c-0.4-0.5-0.6-1.1-0.6-1.8c0-1.6,1.3-2.9,2.9-2.9c0.6,0,0.9,0.1,1.9,0.5c0.3,0.1,0.4,0.1,0.5,0.1c0.1,0,0.1,0,0.5-0.2
                    c0,0,0.1,0,0.1,0c0.1,0,0.2,0.1,0.2,0.3L164.7,1.5z"/>
                        <path fill="#fff" d="M170.4,8.3c0,1.7,0.3,2.2,1.5,2.3c0.3,0,0.4,0,0.4,0.2c0,0.2-0.1,0.2-0.5,0.2c-0.2,0-0.4,0-0.6,0
                    c-0.8-0.1-1.1-0.1-1.6-0.1c-0.5,0-0.9,0-1.2,0.1c-0.2,0-0.5,0.1-0.5,0.1c-0.2,0-0.2-0.1-0.2-0.2c0-0.1,0-0.1,0.2-0.2
                    c0.3,0,0.7-0.4,0.8-0.7c0.1-0.3,0.1-0.4,0.1-1.5V8.1V2.7c0-1.2-0.2-1.5-1.1-1.7c-0.5-0.1-0.6-0.1-0.6-0.3c0-0.1,0.1-0.2,0.2-0.2
                    c0.1,0,0.2,0,0.4,0.1c0.2,0,0.5,0.1,0.9,0.1c0.4,0,0.7,0,1.6-0.1c0.5,0,0.9-0.1,1.2-0.1c0.2,0,0.2,0,0.2,0.2c0,0.2,0,0.2-0.2,0.3
                    c-0.8,0.2-0.9,0.3-0.9,1.5V8.3z"/>
                        <path fill="#fff" d="M179.2,8.1c0,1.2,0.1,1.4,0.4,1.8c0.3,0.4,0.7,0.6,1.3,0.6c0.2,0,0.3,0.1,0.3,0.2c0,0.2,0,0.2-0.2,0.2
                    c0,0,0,0-0.8,0c-1-0.1-1-0.1-1.3-0.1c-0.4,0-0.5,0-1.4,0.1l-1,0.1c-0.2,0-0.3,0-0.4,0c-0.1,0-0.2-0.1-0.2-0.2
                    c0-0.2,0.1-0.3,0.4-0.3c1-0.1,1.3-0.7,1.2-1.8V2.1c0-0.7-0.1-0.8-0.8-0.8c-1.1,0-1.8,0.1-2.1,0.3c-0.4,0.2-0.5,0.4-0.7,1.3
                    c-0.1,0.4-0.2,0.5-0.3,0.5c-0.1,0-0.2-0.1-0.2-0.2c0,0,0,0,0-0.4c0-0.2,0-0.2,0.1-0.9c0-0.2,0.1-0.5,0.1-0.7c0-0.2,0-0.3,0.1-0.5
                    c0-0.2,0.1-0.3,0.3-0.3c0,0,0.2,0,0.3,0c0.1,0,0.5,0,0.8,0l1.6,0c1.5,0,1.5,0,1.9,0c0.9,0,2.9,0,3.8-0.1l0.5,0c0.4,0,0.4,0,0.5,0.9
                    c0,0.4,0.1,0.6,0.1,0.6c0,0.2,0.1,0.6,0.1,0.7c0,0.2-0.1,0.2-0.2,0.2c-0.1,0-0.2-0.1-0.3-0.3c-0.1-0.4-0.4-0.8-0.7-1.1
                    c-0.3-0.2-0.6-0.3-1.3-0.3c-1.5,0-1.7,0.1-1.7,1.1V8.1z"/>
                        <path fill="#fff" d="M190,8.8c0,1.3,0.2,1.6,1.6,1.7c0.2,0,0.3,0.1,0.3,0.2c0,0.2-0.1,0.2-0.4,0.2c-0.2,0-0.2,0-1.4-0.1
                    c-0.2,0-0.5,0-1,0c-0.8,0-1.4,0-1.8,0.1c-0.3,0-0.4,0.1-0.5,0.1c-0.1,0-0.2,0-0.2-0.2c0-0.2,0-0.2,0.2-0.2c1.2-0.2,1.5-0.6,1.5-2
                    V7.1c0-0.5-0.1-0.6-0.3-1.1c-0.3-0.4-0.6-1-0.9-1.6c-0.4-0.7-0.8-1.5-1.2-2.2c-0.5-1-0.9-1.3-1.6-1.4c-0.2,0-0.3-0.1-0.3-0.2
                    c0-0.2,0.1-0.3,0.2-0.3c0.1,0,0.3,0,1.2,0.1c0.2,0,0.5,0,0.8,0c0.4,0,0.8,0,1.3-0.1c0.4,0,0.5,0,0.6,0c0.2,0,0.3,0.1,0.3,0.2
                    c0,0.1-0.1,0.2-0.3,0.2c-0.4,0.1-0.6,0.3-0.6,0.5c0,0.3,0.1,0.5,0.6,1.4c0.1,0.3,0.7,1.3,1,2.1c0.2,0.4,0.3,0.5,0.5,0.5
                    c0.2,0,0.3-0.2,0.7-0.8c0.3-0.6,0.5-0.9,0.5-0.9c0.7-1.2,0.8-1.6,0.8-1.9c0-0.5-0.6-0.9-1.2-1c-0.2,0-0.2-0.1-0.2-0.2
                    c0-0.2,0.1-0.3,0.3-0.3c0.2,0,0.2,0,0.8,0.1c0.2,0,0.4,0,0.8,0c0.3,0,0.3,0,1.2-0.1c0.1,0,0.3,0,0.5,0h0.1c0.1,0,0.2,0.1,0.2,0.2
                    c0,0.1-0.1,0.2-0.3,0.2c-0.9,0.3-1.1,0.6-1.8,1.9c-0.5,1-1.3,2.4-1.8,3.1C190,6.3,190,6.3,190,6.9V8.8z"/>
                        <path fill="#fff" d="M202.2,5.1c0,3.3,1.6,5.5,3.9,5.5c1,0,2-0.5,2.5-1.2c0.6-0.8,1-2.1,1-3.3c0-1.5-0.5-3-1.4-3.9
                    c-0.7-0.8-1.7-1.2-2.7-1.2C203.4,0.9,202.2,2.5,202.2,5.1 M211.3,5.3c0,1.7-0.7,3.5-1.9,4.5c-0.9,0.8-2.2,1.3-3.7,1.3
                    c-3.3,0-5.4-2.1-5.4-5.3c0-1.5,0.7-3.2,1.7-4.1c1-0.9,2.5-1.4,4-1.4C209.2,0.3,211.3,2.3,211.3,5.3"/>
                        <path fill="#fff" d="M216.5,4.3c0,0.6,0.1,0.7,0.5,0.7h0.3c1.6,0,1.9-0.1,2.3-1.2c0-0.1,0.1-0.2,0.2-0.2c0.2,0,0.2,0,0.2,0.2
                    c0,0,0,0.1,0,0.2v0.3c0,0.4,0,0.7,0.1,1.9c0,0.3,0,0.8,0,0.8c0,0.1-0.1,0.2-0.2,0.2c-0.1,0-0.2,0-0.2-0.2c-0.2-1-0.6-1.3-1.8-1.3
                    c-0.8,0-1.2,0-1.3,0.1c-0.2,0.1-0.2,0.1-0.2,1.4v0.4v0.9c0,1.6,0.4,2.1,1.6,2.1c0.2,0,0.3,0.1,0.3,0.2c0,0.1,0,0.2-0.2,0.2
                    l-1.6-0.1h-0.8c-0.4,0-0.7,0-1,0c-0.3,0-0.6,0.1-0.8,0.1c-0.2,0-0.3-0.1-0.3-0.2c0-0.1,0-0.1,0.2-0.2c0.6-0.2,0.8-0.7,0.8-1.8V2.6
                    c0-1.2-0.2-1.5-1.4-1.6c-0.2,0-0.2-0.1-0.2-0.2c0-0.2,0.1-0.2,0.3-0.2c0,0,0.2,0,0.4,0c0.3,0,0.5,0,0.9,0l1.4,0l2,0
                    c0.4,0,2.1-0.1,2.7-0.1h0c0.2,0,0.2,0,0.2,1c0.1,0.8,0.1,0.8,0.1,0.9c0,0.4-0.1,0.6-0.3,0.6c-0.1,0-0.1-0.1-0.2-0.2
                    c0-0.5,0-0.6-0.2-0.8c-0.3-0.5-0.8-0.7-1.7-0.7l-1.2,0c-0.5,0-0.8,0-0.9,0.2c-0.1,0.1-0.1,0.2-0.1,0.8V4.3z"/>
                        <path fill="#fff" d="M233.1,8.1c0,1.2,0.1,1.4,0.4,1.8c0.3,0.4,0.7,0.6,1.3,0.6c0.2,0,0.3,0.1,0.3,0.2c0,0.2,0,0.2-0.2,0.2
                    c0,0,0,0-0.8,0c-1-0.1-1-0.1-1.3-0.1c-0.4,0-0.5,0-1.4,0.1l-1,0.1c-0.2,0-0.3,0-0.4,0c-0.1,0-0.2-0.1-0.2-0.2
                    c0-0.2,0.1-0.3,0.4-0.3c1-0.1,1.3-0.7,1.2-1.8V2.1c0-0.7-0.1-0.8-0.8-0.8c-1.1,0-1.8,0.1-2.1,0.3c-0.4,0.2-0.5,0.4-0.7,1.3
                    c-0.1,0.4-0.2,0.5-0.3,0.5c-0.1,0-0.2-0.1-0.2-0.2c0,0,0,0,0-0.4c0-0.2,0-0.2,0.1-0.9c0-0.2,0.1-0.5,0.1-0.7c0-0.2,0-0.3,0.1-0.5
                    c0-0.2,0.1-0.3,0.3-0.3c0,0,0.2,0,0.3,0c0.1,0,0.5,0,0.8,0l1.6,0c1.5,0,1.5,0,1.9,0c0.9,0,2.9,0,3.8-0.1l0.5,0c0.4,0,0.4,0,0.5,0.9
                    c0,0.4,0.1,0.6,0.1,0.6c0,0.2,0.1,0.6,0.1,0.7c0,0.2-0.1,0.2-0.2,0.2c-0.1,0-0.2-0.1-0.3-0.3c-0.1-0.4-0.4-0.8-0.7-1.1
                    c-0.3-0.2-0.6-0.3-1.3-0.3c-1.5,0-1.7,0.1-1.7,1.1V8.1z"/>
                        <path fill="#fff" d="M241.9,3.9c0,1,0.1,1.1,0.6,1.1l0.6,0h0.6c0.6,0,1-0.3,1.4-1.2c0-0.1,0.1-0.2,0.2-0.2c0.1,0,0.2,0.1,0.2,0.2
                    c0,0.1,0,0.2,0,0.4c0,0.1,0,0.2,0,0.4c0,0.2,0,0.2,0.1,1.1c0,0.4,0,1,0,1.4c0,0.1,0,0.2-0.2,0.2c-0.1,0-0.2-0.1-0.2-0.3
                    c-0.3-1.2-0.5-1.3-2.4-1.3c-0.5,0-0.7,0-0.8,0.3c-0.1,0.2-0.1,0.4-0.1,1.5v0.7c0,0.6,0.1,1.3,0.2,1.6c0.2,0.5,0.4,0.6,0.8,0.6
                    c1.4,0,2.5-0.3,3.3-0.9c0.3-0.3,0.7-0.7,0.8-1c0-0.1,0.1-0.1,0.1-0.1c0.1,0,0.2,0.1,0.2,0.2c0,0.5-0.3,1.3-0.5,1.7
                    c-0.5,0.6-1,0.9-2,0.9c-0.5,0-0.5,0-2-0.1c-0.3,0-0.7,0-1.3,0c-0.5,0-0.6,0-1.8,0.1l-0.5,0c-0.1,0-0.2,0-0.2-0.2
                    c0-0.1,0-0.2,0.2-0.2c0.7-0.2,0.9-0.7,0.9-2.1V2.5c0-1.2-0.3-1.4-1.4-1.6c-0.2,0-0.2-0.1-0.2-0.2c0-0.1,0.1-0.2,0.2-0.2l0.3,0
                    l0.4,0c1.3,0,2.1,0,3.9,0c0.7,0,2.5,0,2.8-0.1h0.1c0.2,0,0.2,0.1,0.2,0.3c0,0.2,0,0.4,0,0.6c0.1,0.7,0.1,0.8,0.1,1
                    c0,0.4-0.1,0.6-0.3,0.6c-0.1,0-0.1-0.1-0.2-0.3c0-1-0.8-1.5-2.4-1.4H243c-1,0-1.1,0.1-1.1,1.1V3.9z"/>
                        <path fill="#fff" d="M257,6.8c0.6,0.7,0.8,0.9,0.9,0.9c0.1,0,0.1-0.1,0.2-0.2c0-0.1,0.1-2.7,0.1-3.6c0-2.3-0.4-2.9-1.8-3.1
                    c-0.2,0-0.3-0.1-0.3-0.2c0-0.1,0.1-0.2,0.2-0.2c0.2,0,0.3,0,0.9,0.1c0.2,0,0.5,0,0.6,0c0.3,0,1,0,1.7-0.1c0.1,0,0.2,0,0.3,0
                    c0.1,0,0.2,0.1,0.2,0.2c0,0.2-0.1,0.2-0.3,0.3c-0.7,0.2-1,0.8-1,2.1l-0.1,4.8c0,0.9,0,0.9,0,1.2c0,0.7,0,1.5,0,1.7v0.1
                    c0,0.1,0,0.2-0.2,0.2c-0.1,0-0.2-0.1-0.3-0.2l-7-7.7c-0.2-0.2-0.2-0.2-0.3-0.2c-0.1,0-0.2,0.1-0.2,0.6v3c0,3.6,0.2,3.9,1.7,4.1
                    c0.2,0,0.2,0.1,0.2,0.2c0,0.1-0.1,0.2-0.2,0.2c0,0-0.2,0-0.3,0c-0.4-0.1-1-0.1-1.4-0.1c-0.4,0-1.1,0-1.4,0.1c-0.2,0-0.3,0-0.4,0
                    c-0.1,0-0.2-0.1-0.2-0.2c0-0.1,0-0.2,0.2-0.2c1-0.4,1-0.6,1.1-3.9V5.8V3.4c0-1.5-0.6-2.4-1.7-2.5c-0.2,0-0.2-0.1-0.2-0.2
                    c0-0.1,0.1-0.2,0.2-0.2l0.5,0c0.6,0,1.1,0,1.6-0.1c0.2,0,0.3,0,0.4,0c0.3,0,0.3,0,0.8,0.5c0.1,0.1,0.1,0.1,0.6,0.7
                    c0.3,0.4,0.4,0.5,0.5,0.6L257,6.8z"/>
                        <path fill="#fff" d="M269.9,6.8c0.6,0.7,0.8,0.9,0.9,0.9c0.1,0,0.1-0.1,0.2-0.2c0-0.1,0.1-2.7,0.1-3.6c0-2.3-0.4-2.9-1.8-3.1
                    c-0.2,0-0.3-0.1-0.3-0.2c0-0.1,0.1-0.2,0.2-0.2c0.2,0,0.3,0,0.9,0.1c0.2,0,0.5,0,0.6,0c0.3,0,1,0,1.7-0.1c0.1,0,0.2,0,0.2,0
                    c0.1,0,0.2,0.1,0.2,0.2c0,0.2-0.1,0.2-0.3,0.3c-0.7,0.2-1,0.8-1,2.1l-0.1,4.8c0,0.9,0,0.9,0,1.2c0,0.7,0,1.5,0,1.7v0.1
                    c0,0.1,0,0.2-0.2,0.2c-0.1,0-0.2-0.1-0.3-0.2l-7-7.7c-0.2-0.2-0.2-0.2-0.3-0.2c-0.1,0-0.2,0.1-0.2,0.6v3c0,3.6,0.2,3.9,1.7,4.1
                    c0.2,0,0.2,0.1,0.2,0.2c0,0.1-0.1,0.2-0.2,0.2c0,0-0.2,0-0.3,0c-0.4-0.1-1-0.1-1.4-0.1c-0.4,0-1.1,0-1.4,0.1c-0.2,0-0.3,0-0.4,0
                    c-0.1,0-0.2-0.1-0.2-0.2c0-0.1,0-0.2,0.2-0.2c1-0.4,1-0.6,1.1-3.9V5.8V3.4c0-1.5-0.6-2.4-1.7-2.5c-0.2,0-0.2-0.1-0.2-0.2
                    c0-0.1,0.1-0.2,0.2-0.2l0.5,0c0.6,0,1.1,0,1.6-0.1c0.2,0,0.3,0,0.4,0c0.3,0,0.3,0,0.8,0.5c0.1,0.1,0.1,0.1,0.6,0.7
                    c0.3,0.4,0.4,0.5,0.5,0.6L269.9,6.8z"/>
                        <path fill="#fff" d="M277.8,3.9c0,1,0.1,1.1,0.6,1.1l0.6,0h0.6c0.6,0,1-0.3,1.4-1.2c0-0.1,0.1-0.2,0.2-0.2c0.1,0,0.2,0.1,0.2,0.2
                    c0,0.1,0,0.2,0,0.4c0,0.1,0,0.2,0,0.4c0,0.2,0,0.2,0.1,1.1c0,0.4,0,1,0,1.4c0,0.1,0,0.2-0.2,0.2c-0.1,0-0.2-0.1-0.2-0.3
                    c-0.3-1.2-0.5-1.3-2.4-1.3c-0.5,0-0.7,0-0.8,0.3c-0.1,0.2-0.1,0.4-0.1,1.5v0.7c0,0.6,0.1,1.3,0.2,1.6c0.2,0.5,0.4,0.6,0.8,0.6
                    c1.4,0,2.5-0.3,3.3-0.9c0.3-0.3,0.7-0.7,0.8-1c0-0.1,0.1-0.1,0.1-0.1c0.1,0,0.2,0.1,0.2,0.2c0,0.5-0.3,1.3-0.5,1.7
                    c-0.5,0.6-1,0.9-2,0.9c-0.5,0-0.5,0-2-0.1c-0.3,0-0.7,0-1.3,0c-0.5,0-0.6,0-1.8,0.1l-0.5,0c-0.1,0-0.2,0-0.2-0.2
                    c0-0.1,0-0.2,0.2-0.2c0.7-0.2,0.9-0.7,0.9-2.1V2.5c0-1.2-0.3-1.4-1.4-1.6c-0.2,0-0.2-0.1-0.2-0.2c0-0.1,0.1-0.2,0.2-0.2l0.3,0
                    l0.4,0c1.3,0,2.1,0,3.9,0c0.7,0,2.5,0,2.8-0.1h0.1c0.2,0,0.2,0.1,0.2,0.3c0,0.2,0,0.4,0,0.6c0.1,0.7,0.1,0.8,0.1,1
                    c0,0.4-0.1,0.6-0.3,0.6c-0.1,0-0.1-0.1-0.2-0.3c0-1-0.8-1.5-2.4-1.4h-0.7c-1,0-1.1,0.1-1.1,1.1V3.9z"/>
                        <path fill="#fff" d="M291.1,1.5c0,0.3,0,0.3,0.1,1.1c0,0.3,0.1,0.8,0.1,0.9c0,0.2-0.1,0.3-0.2,0.3c-0.1,0-0.2-0.1-0.2-0.3
                    c-0.3-1.5-1.7-2.6-3-2.6c-0.9,0-1.7,0.7-1.7,1.6c0,0.4,0.2,0.9,0.6,1.1c0.3,0.2,0.5,0.3,1.7,0.8c1.2,0.5,1.8,0.8,2.2,1.3
                    c0.5,0.5,0.9,1.4,0.9,2.2c0,0.9-0.3,1.7-1,2.3c-0.6,0.6-1.5,1-2.2,1c-0.4,0-1-0.1-1.7-0.4c-0.5-0.2-0.5-0.2-0.8-0.2
                    c-0.3-0.1-0.3-0.1-0.4-0.1c-0.1-0.1-0.1-0.1-0.1-0.4c0-0.2-0.1-0.7-0.2-1c-0.3-1-0.3-1-0.3-1.3c0-0.3,0.1-0.4,0.2-0.4
                    c0.1,0,0.1,0,0.2,0.2c0.5,1.7,1.9,3.1,3.2,3.1c1.1,0,2-0.9,2-2c0-0.5-0.2-1-0.6-1.3c-0.3-0.2-0.3-0.2-2-1c-1.3-0.6-1.7-0.9-2.2-1.3
                    C285.2,4.6,285,4,285,3.2c0-1.6,1.3-2.9,2.9-2.9c0.6,0,0.9,0.1,1.9,0.5c0.3,0.1,0.4,0.1,0.5,0.1c0.1,0,0.1,0,0.5-0.2
                    c0,0,0.1,0,0.1,0c0.1,0,0.2,0.1,0.2,0.3L291.1,1.5z"/>
                        <path fill="#fff" d="M299.7,1.5c0,0.3,0,0.3,0.1,1.1c0,0.3,0.1,0.8,0.1,0.9c0,0.2-0.1,0.3-0.2,0.3c-0.1,0-0.2-0.1-0.2-0.3
                    c-0.3-1.5-1.7-2.6-3-2.6c-0.9,0-1.7,0.7-1.7,1.6c0,0.4,0.2,0.9,0.6,1.1c0.3,0.2,0.5,0.3,1.7,0.8c1.2,0.5,1.8,0.8,2.2,1.3
                    c0.5,0.5,0.9,1.4,0.9,2.2c0,0.9-0.3,1.7-1,2.3c-0.6,0.6-1.5,1-2.2,1c-0.4,0-1-0.1-1.7-0.4c-0.5-0.2-0.5-0.2-0.8-0.2
                    c-0.3-0.1-0.3-0.1-0.4-0.1c-0.1-0.1-0.1-0.1-0.1-0.4c0-0.2-0.1-0.7-0.2-1c-0.3-1-0.3-1-0.3-1.3c0-0.3,0.1-0.4,0.2-0.4
                    c0.1,0,0.1,0,0.2,0.2c0.5,1.7,1.9,3.1,3.2,3.1c1.1,0,2-0.9,2-2c0-0.5-0.2-1-0.6-1.3c-0.3-0.2-0.3-0.2-2-1c-1.3-0.6-1.7-0.9-2.2-1.3
                    c-0.4-0.5-0.6-1.1-0.6-1.8c0-1.6,1.3-2.9,2.9-2.9c0.6,0,0.9,0.1,1.9,0.5c0.3,0.1,0.4,0.1,0.5,0.1c0.1,0,0.1,0,0.5-0.2
                    c0,0,0.1,0,0.1,0c0.1,0,0.2,0.1,0.2,0.3L299.7,1.5z"/>
                        <path fill="#fff" d="M305.4,3.9c0,1,0.1,1.1,0.6,1.1l0.6,0h0.6c0.6,0,1-0.3,1.4-1.2c0-0.1,0.1-0.2,0.2-0.2c0.1,0,0.2,0.1,0.2,0.2
                    c0,0.1,0,0.2,0,0.4c0,0.1,0,0.2,0,0.4c0,0.2,0,0.2,0.1,1.1c0,0.4,0,1,0,1.4c0,0.1,0,0.2-0.2,0.2c-0.1,0-0.2-0.1-0.2-0.3
                    c-0.3-1.2-0.5-1.3-2.4-1.3c-0.5,0-0.7,0-0.8,0.3c-0.1,0.2-0.1,0.4-0.1,1.5v0.7c0,0.6,0.1,1.3,0.2,1.6c0.2,0.5,0.4,0.6,0.8,0.6
                    c1.4,0,2.5-0.3,3.3-0.9c0.3-0.3,0.7-0.7,0.8-1c0-0.1,0.1-0.1,0.1-0.1c0.1,0,0.2,0.1,0.2,0.2c0,0.5-0.3,1.3-0.5,1.7
                    c-0.5,0.6-1,0.9-2,0.9c-0.5,0-0.5,0-2-0.1c-0.3,0-0.7,0-1.3,0c-0.5,0-0.6,0-1.8,0.1l-0.5,0c-0.1,0-0.2,0-0.2-0.2
                    c0-0.1,0-0.2,0.2-0.2c0.7-0.2,0.9-0.7,0.9-2.1V2.5c0-1.2-0.3-1.4-1.4-1.6c-0.2,0-0.2-0.1-0.2-0.2c0-0.1,0.1-0.2,0.2-0.2l0.3,0
                    l0.4,0c1.3,0,2.1,0,3.9,0c0.7,0,2.5,0,2.8-0.1h0.1c0.2,0,0.2,0.1,0.2,0.3c0,0.2,0,0.4,0,0.6c0.1,0.7,0.1,0.8,0.1,1
                    c0,0.4-0.1,0.6-0.3,0.6c-0.1,0-0.1-0.1-0.2-0.3c0-1-0.8-1.5-2.4-1.4h-0.7c-1,0-1.1,0.1-1.1,1.1V3.9z"/>
                        <path fill="#fff" d="M315.6,3.9c0,1,0.1,1.1,0.6,1.1l0.6,0h0.6c0.6,0,1-0.3,1.4-1.2c0-0.1,0.1-0.2,0.2-0.2c0.1,0,0.2,0.1,0.2,0.2
                    c0,0.1,0,0.2,0,0.4c0,0.1,0,0.2,0,0.4c0,0.2,0,0.2,0.1,1.1c0,0.4,0,1,0,1.4c0,0.1,0,0.2-0.2,0.2c-0.1,0-0.2-0.1-0.2-0.3
                    c-0.3-1.2-0.5-1.3-2.4-1.3c-0.5,0-0.7,0-0.8,0.3c-0.1,0.2-0.1,0.4-0.1,1.5v0.7c0,0.6,0.1,1.3,0.2,1.6c0.2,0.5,0.4,0.6,0.8,0.6
                    c1.4,0,2.5-0.3,3.3-0.9c0.3-0.3,0.7-0.7,0.8-1c0-0.1,0.1-0.1,0.1-0.1c0.1,0,0.2,0.1,0.2,0.2c0,0.5-0.3,1.3-0.5,1.7
                    c-0.5,0.6-1,0.9-2,0.9c-0.5,0-0.5,0-2-0.1c-0.3,0-0.7,0-1.3,0c-0.5,0-0.6,0-1.8,0.1l-0.5,0c-0.1,0-0.2,0-0.2-0.2
                    c0-0.1,0-0.2,0.2-0.2c0.7-0.2,0.9-0.7,0.9-2.1V2.5c0-1.2-0.3-1.4-1.4-1.6c-0.2,0-0.2-0.1-0.2-0.2c0-0.1,0.1-0.2,0.2-0.2l0.2,0
                    l0.4,0c1.3,0,2.1,0,3.9,0c0.7,0,2.5,0,2.8-0.1h0.1c0.2,0,0.2,0.1,0.2,0.3c0,0.2,0,0.4,0,0.6c0.1,0.7,0.1,0.8,0.1,1
                    c0,0.4-0.1,0.6-0.3,0.6c-0.1,0-0.1-0.1-0.2-0.3c0-1-0.8-1.5-2.4-1.4h-0.7c-1,0-1.1,0.1-1.1,1.1V3.9z"/>
                        <path fill="#fff" d="M72.5,20.4c0,0.7,0,0.8,0.3,2c0.1,0.3,0.1,0.7,0.1,1c0,0.4-0.2,0.7-0.5,0.7c-0.2,0-0.3-0.1-0.3-0.4
                    c-0.2-1-1.7-3.4-2.9-4.5c-1.9-1.8-3.9-2.7-6.1-2.7c-1.9,0-3.2,0.6-4.6,2.1c-1.7,1.8-2.5,4.2-2.5,7.2c0,3.3,1,6.2,2.8,8.3
                    c1.6,1.8,3.8,3,5.9,3c1.8,0,3.9-0.8,5.5-2c0.7-0.5,0.7-0.5,2.1-2c0.2-0.2,0.3-0.3,0.4-0.3c0.2,0,0.3,0.2,0.3,0.3
                    c0,0.5-0.8,1.6-1.7,2.6c-2.2,2.3-5.2,3.5-8.3,3.5c-6.6,0-11.1-4.7-11.1-11.5c0-3.2,1.4-6.8,3.5-9c2.1-2.1,5.1-3.4,8.2-3.4
                    c2.4,0,3.7,0.4,6.5,2c0.2,0.1,0.4,0.2,0.6,0.2c0.3,0,0.3,0,0.8-0.8c0.1-0.1,0.2-0.1,0.3-0.1c0.5,0,0.5,0.1,0.6,2.3V20.4z"/>
                        <path fill="#fff" d="M83.8,27.2c-1.5,0-1.8,0.3-1.8,1.9v4.2c-0.1,3,0.9,4.4,3.3,4.5c0.4,0,0.6,0.1,0.6,0.4c0,0.4-0.2,0.5-0.9,0.5
                    c-0.2,0-0.6,0-1.2-0.1c-1.1-0.1-2.8-0.2-3.5-0.2c-0.7,0-1.5,0.1-4,0.3h-0.2c-0.3,0-0.5-0.2-0.5-0.6c0-0.2,0.1-0.3,0.4-0.4
                    c1-0.1,1.8-0.9,2-1.9c0.1-0.4,0.1-0.5,0.1-2.6V19.9c0.1-2.2-0.7-3-3.1-3.4c-0.4-0.1-0.5-0.1-0.5-0.4c0-0.4,0.2-0.6,0.6-0.6
                    c0.2,0,0.7,0,1.1,0.1c0.8,0.1,2.2,0.2,3.4,0.2c0.3,0,0.3,0,2.5-0.2c0.6-0.1,1.7-0.1,1.9-0.1c0.3,0,0.6,0.2,0.6,0.4
                    s-0.1,0.4-0.5,0.5c-1.4,0.2-2,1-2,2.5v4.3c-0.1,2.2,0.1,2.3,1.9,2.3h7.9c1.3,0,1.5-0.4,1.5-2.7v-3c0.1-2.2-0.7-3.1-3.1-3.4
                    c-0.4-0.1-0.5-0.2-0.5-0.4c0-0.4,0.2-0.6,0.6-0.6c0.2,0,0.7,0,1.1,0.1c0.9,0.1,2.2,0.2,3.5,0.2c0.2,0,1.1-0.1,2.3-0.2
                    c0.7-0.1,1.6-0.1,1.9-0.1c0.4,0,0.6,0.1,0.6,0.5c0,0.2-0.1,0.4-0.5,0.4c-1.4,0.2-2,1-2,2.5v14.4c-0.1,3,0.9,4.4,3.2,4.5
                    c0.5,0,0.7,0.1,0.7,0.4c0,0.4-0.2,0.5-0.9,0.5c-0.2,0-0.6,0-1.2-0.1c-1.1-0.1-2.8-0.2-3.5-0.2c-0.7,0-1.5,0.1-4,0.3h-0.2
                    c-0.3,0-0.5-0.2-0.5-0.6c0-0.2,0.1-0.3,0.4-0.4c1-0.1,1.8-0.9,2-1.9c0.1-0.4,0.1-0.5,0.1-2.6v-3.7c0-2.1-0.1-2.4-1.5-2.3H83.8z"/>
                        <path fill="#fff" d="M113.8,22.9c-0.5-1.1-0.9-1.9-1.1-1.9c-0.2,0-0.2,0-1.1,1.9l-2,4.5c-0.3,0.7-0.3,0.7-0.3,0.9
                    c0,0.4,0.3,0.6,1.2,0.6h4.6c0.9,0,1-0.1,1-0.3c0-0.1,0-0.1-0.1-0.5L113.8,22.9z M123,35.1c1.1,2.1,1.4,2.4,3.3,2.9
                    c0.2,0,0.3,0.1,0.3,0.5c0,0.3-0.1,0.4-0.4,0.4c-0.1,0-0.2,0-0.7-0.1c-0.7-0.1-2.9-0.3-4.2-0.3c-1.5,0-3.3,0.1-3.9,0.2
                    c-0.2,0-0.3,0.1-0.4,0.1c-0.2,0-0.5-0.2-0.5-0.5c0-0.2,0.1-0.2,0.4-0.3c1.1-0.3,1.9-1.2,1.9-2.1c0-0.7-0.7-2.5-1.6-4.4
                    c-0.4-0.8-0.8-1-2.8-1h-4.2c-1.6,0-2,0.3-2.7,1.9c-0.8,1.9-1,2.4-1,3c0,1.4,1,2.2,3,2.4c0.4,0.1,0.6,0.2,0.6,0.4
                    c0,0.3-0.2,0.5-0.6,0.5c-0.2,0-0.6,0-0.9-0.1c-0.8-0.2-1.4-0.2-2-0.2c-0.6,0-1.2,0-3.5,0.3l-0.8,0c-0.3,0-0.4-0.1-0.4-0.4
                    c0-0.2,0.1-0.4,0.5-0.5c1.2-0.4,1.6-0.9,3.1-4.3l4.6-10.6c0.4-0.8,0.7-1.4,0.8-1.7l1.6-3.2c1.4-2.8,1.4-2.8,1.5-2.8
                    c0.2,0,0.7,0.8,1.3,2.3L123,35.1z"/>
                        <path fill="#fff" d="M137.9,32.4c0.1,2.5,0.2,3.1,0.8,3.9c0.6,0.9,1.6,1.3,2.9,1.4c0.5,0,0.6,0.1,0.6,0.5c0,0.3-0.1,0.4-0.5,0.4
                    c-0.1,0-0.1,0-1.7-0.1c-2.3-0.2-2.3-0.2-2.8-0.2c-0.9,0-1.1,0-3.1,0.1l-2.3,0.1c-0.4,0-0.7,0.1-0.9,0.1c-0.3,0-0.4-0.1-0.4-0.4
                    c0-0.5,0.2-0.6,0.8-0.7c2.1-0.3,2.9-1.4,2.7-4.1V19.1c0-1.4-0.2-1.7-1.7-1.7c-2.3,0-3.9,0.2-4.7,0.7c-0.9,0.5-1.1,0.8-1.6,2.9
                    c-0.2,1-0.4,1.2-0.7,1.2c-0.3,0-0.5-0.2-0.5-0.5c0-0.1,0-0.1,0.1-0.9c0.1-0.4,0.1-0.4,0.2-1.9c0.1-0.5,0.1-1,0.2-1.5
                    c0.1-0.4,0.1-0.7,0.1-1c0-0.5,0.2-0.7,0.7-0.7c0.1,0,0.4,0,0.6,0c0.3,0,1,0,1.9,0.1l3.4,0c3.3,0,3.3,0,4.1,0c1.9,0,6.5-0.1,8.3-0.2
                    l1.2,0c0.9,0,0.9,0,1,2c0.1,0.8,0.1,1.2,0.1,1.4c0.1,0.4,0.1,1.2,0.1,1.4c0,0.3-0.1,0.5-0.4,0.5c-0.3,0-0.4-0.1-0.6-0.6
                    c-0.2-0.9-0.8-1.9-1.4-2.3c-0.6-0.4-1.3-0.6-2.9-0.6c-3.3,0-3.8,0.3-3.8,2.3V32.4z"/>
                        <path fill="#fff" d="M162.8,32.4c0.1,2.5,0.2,3.1,0.8,3.9c0.6,0.9,1.6,1.3,2.9,1.4c0.5,0,0.6,0.1,0.6,0.5c0,0.3-0.1,0.4-0.5,0.4
                    c-0.1,0-0.1,0-1.7-0.1c-2.3-0.2-2.3-0.2-2.8-0.2c-0.9,0-1.1,0-3.1,0.1l-2.3,0.1c-0.4,0-0.7,0.1-0.9,0.1c-0.3,0-0.4-0.1-0.4-0.4
                    c0-0.5,0.2-0.6,0.8-0.7c2.1-0.3,2.9-1.4,2.7-4.1V19.1c0-1.4-0.2-1.7-1.7-1.7c-2.3,0-3.9,0.2-4.7,0.7c-0.9,0.5-1.1,0.8-1.6,2.9
                    c-0.2,1-0.4,1.2-0.7,1.2c-0.3,0-0.5-0.2-0.5-0.5c0-0.1,0-0.1,0.1-0.9c0.1-0.4,0.1-0.4,0.2-1.9c0.1-0.5,0.1-1,0.2-1.5
                    c0.1-0.4,0.1-0.7,0.1-1c0-0.5,0.2-0.7,0.7-0.7c0.1,0,0.4,0,0.6,0c0.3,0,1,0,1.9,0.1l3.4,0c3.3,0,3.3,0,4.1,0c1.9,0,6.5-0.1,8.3-0.2
                    l1.2,0c0.9,0,0.9,0,1,2c0.1,0.8,0.1,1.2,0.1,1.4c0.1,0.4,0.1,1.2,0.1,1.4c0,0.3-0.1,0.5-0.4,0.5c-0.3,0-0.4-0.1-0.6-0.6
                    c-0.2-0.9-0.8-1.9-1.4-2.3c-0.6-0.4-1.3-0.6-2.9-0.6c-3.3,0-3.8,0.3-3.8,2.3V32.4z"/>
                        <path fill="#fff" d="M182.3,22.9c-0.5-1.1-0.9-1.9-1.1-1.9c-0.2,0-0.2,0-1.1,1.9l-2,4.5c-0.3,0.7-0.3,0.7-0.3,0.9
                    c0,0.4,0.3,0.6,1.2,0.6h4.6c0.9,0,1-0.1,1-0.3c0-0.1,0-0.1-0.1-0.5L182.3,22.9z M191.5,35.1c1.1,2.1,1.4,2.4,3.3,2.9
                    c0.2,0,0.3,0.1,0.3,0.5c0,0.3-0.1,0.4-0.4,0.4c-0.1,0-0.2,0-0.7-0.1c-0.7-0.1-2.9-0.3-4.2-0.3c-1.5,0-3.3,0.1-3.9,0.2
                    c-0.2,0-0.3,0.1-0.4,0.1c-0.2,0-0.5-0.2-0.5-0.5c0-0.2,0.1-0.2,0.4-0.3c1.1-0.3,1.9-1.2,1.9-2.1c0-0.7-0.7-2.5-1.6-4.4
                    c-0.4-0.8-0.8-1-2.8-1h-4.2c-1.6,0-2,0.3-2.7,1.9c-0.8,1.9-1,2.4-1,3c0,1.4,1,2.2,3,2.4c0.4,0.1,0.6,0.2,0.6,0.4
                    c0,0.3-0.2,0.5-0.6,0.5c-0.2,0-0.6,0-0.9-0.1c-0.8-0.2-1.4-0.2-2-0.2c-0.6,0-1.2,0-3.5,0.3l-0.8,0c-0.3,0-0.4-0.1-0.4-0.4
                    c0-0.2,0.1-0.4,0.5-0.5c1.2-0.4,1.6-0.9,3.1-4.3l4.6-10.6c0.4-0.8,0.7-1.4,0.8-1.7L181,18c1.4-2.8,1.4-2.8,1.5-2.8
                    c0.2,0,0.7,0.8,1.3,2.3L191.5,35.1z"/>
                        <path fill="#fff" d="M214.3,29.5c1.4,1.6,1.8,1.9,2.1,1.9c0.2,0,0.3-0.2,0.4-0.4c0-0.3,0.2-6,0.2-7.9c0-5.1-0.8-6.4-3.9-6.7
                    c-0.4,0-0.6-0.1-0.6-0.4c0-0.3,0.1-0.4,0.5-0.4c0.5,0,0.8,0,2,0.2c0.5,0.1,1.1,0.1,1.4,0.1c0.8,0,2.1-0.1,3.7-0.3
                    c0.2,0,0.4,0,0.6,0c0.3,0,0.5,0.1,0.5,0.4c0,0.3-0.1,0.4-0.6,0.6c-1.6,0.3-2.3,1.8-2.2,4.7l-0.2,10.5c-0.1,2-0.1,2-0.1,2.6
                    c0,1.5,0,3.2,0.1,3.8v0.2c0,0.3-0.1,0.4-0.3,0.4c-0.2,0-0.4-0.2-0.6-0.4l-15.3-17c-0.4-0.4-0.4-0.4-0.6-0.4c-0.3,0-0.4,0.3-0.4,1.3
                    v6.5c0.1,7.9,0.4,8.6,3.8,9.1c0.4,0,0.5,0.2,0.5,0.4c0,0.3-0.2,0.5-0.5,0.5c-0.1,0-0.4,0-0.7-0.1c-0.9-0.1-2.3-0.2-3.1-0.2
                    c-0.9,0-2.3,0.1-3.1,0.2c-0.3,0.1-0.7,0.1-0.9,0.1c-0.3,0-0.4-0.1-0.4-0.4c0-0.2,0.1-0.3,0.5-0.4c2.2-0.9,2.3-1.3,2.5-8.6v-2v-5.3
                    c0.1-3.3-1.4-5.3-3.8-5.4c-0.4,0-0.5-0.1-0.5-0.4c0-0.3,0.2-0.5,0.5-0.5l1.1,0c1.4,0,2.5,0,3.6-0.1c0.3,0,0.7-0.1,1-0.1
                    c0.6,0,0.8,0.1,1.7,1.2c0.2,0.2,0.2,0.2,1.3,1.5c0.7,0.8,1,1.1,1.1,1.2L214.3,29.5z"/>
                        <path fill="#fff" d="M225.9,25.8c0,7.2,3.5,12,8.6,12c2.2,0,4.3-1,5.5-2.6c1.3-1.7,2.1-4.6,2.1-7.4c0-3.3-1.1-6.5-3-8.7 c-1.4-1.7-3.8-2.7-6-2.7C228.7,16.5,225.9,20,225.9,25.8 M246.1,26.3c0,3.8-1.6,7.6-4.1,10c-2,1.8-4.9,2.9-8.2,2.9 c-7.3,0-12-4.6-12-11.7c0-3.4,1.5-7,3.7-9c2.2-2,5.4-3.2,8.8-3.2C241.3,15.2,246.1,19.7,246.1,26.3"/>
                        <path fill="#fff" d="M252.6,25.8c0,7.2,3.5,12,8.6,12c2.2,0,4.3-1,5.5-2.6c1.3-1.7,2.1-4.6,2.1-7.4c0-3.3-1.1-6.5-3-8.7 c-1.4-1.7-3.8-2.7-6-2.7C255.3,16.5,252.6,20,252.6,25.8 M272.7,26.3c0,3.8-1.6,7.6-4.1,10c-2,1.8-4.9,2.9-8.2,2.9 c-7.3,0-12-4.6-12-11.7c0-3.4,1.5-7,3.7-9c2.2-2,5.4-3.2,8.8-3.2C268,15.2,272.7,19.7,272.7,26.3"/>
                        <path fill="#fff" d="M295.9,20.7c0,0.8,0,1.4,0.1,2.4c0,0.1,0,0.2,0,0.3c0,0.3-0.2,0.5-0.5,0.5c-0.2,0-0.3-0.2-0.5-0.7 c-0.8-3.8-4.4-6.7-8.3-6.7c-4.6,0-7.5,3.9-7.5,9.9c0,6.3,3.2,11.4,7.3,11.4c1.5,0,3.9-0.8,4.9-1.5c0.7-0.5,0.9-1.6,0.9-3.7 c0-2.7-0.8-3.5-3.4-3.7c-0.3,0-0.5-0.2-0.5-0.5c0-0.3,0.2-0.4,0.6-0.4c0.1,0,0.3,0,0.6,0c1.4,0.1,2.1,0.2,3.8,0.2 c1.3,0,2.3,0,3.1-0.1c0.5-0.1,1-0.1,1.3-0.1c0.3,0,0.6,0.2,0.6,0.4c0,0.3-0.2,0.4-0.6,0.5c-1.3,0.3-1.7,1.2-1.7,4c0,0.3,0,0.7,0,1 c0,0.5,0.1,1,0.1,1.2c0,0.7-0.2,0.9-1.1,1.2c-0.2,0.1-1.2,0.5-2.7,1.1c-2.8,1.2-5,1.7-7,1.7c-2.9,0-5.5-1.1-7.4-3c-2-2-3-4.7-3-8.1 c0-7.1,5.1-12.7,11.6-12.7c2,0,3.8,0.4,6.5,1.7c0.7,0.3,1,0.4,1.2,0.4c0.2,0,0.3,0,0.6-0.3c0.1-0.1,0.3-0.2,0.4-0.2 c0.4,0,0.5,0.2,0.5,0.6v1.2L295.9,20.7z"/>
                        <path fill="#fff" d="M309.6,22.9c-0.5-1.1-0.9-1.9-1.1-1.9c-0.2,0-0.2,0-1.1,1.9l-2,4.5c-0.3,0.7-0.3,0.7-0.3,0.9 c0,0.4,0.3,0.6,1.2,0.6h4.6c0.9,0,1-0.1,1-0.3c0-0.1,0-0.1-0.1-0.5L309.6,22.9z M318.8,35.1c1.1,2.1,1.4,2.4,3.3,2.9 c0.2,0,0.3,0.1,0.3,0.5c0,0.3-0.1,0.4-0.4,0.4c-0.1,0-0.2,0-0.7-0.1c-0.7-0.1-2.9-0.3-4.2-0.3c-1.5,0-3.3,0.1-3.9,0.2 c-0.2,0-0.3,0.1-0.4,0.1c-0.2,0-0.5-0.2-0.5-0.5c0-0.2,0.1-0.2,0.4-0.3c1.1-0.3,1.9-1.2,1.9-2.1c0-0.7-0.7-2.5-1.6-4.4 c-0.4-0.8-0.8-1-2.8-1H306c-1.6,0-2,0.3-2.7,1.9c-0.8,1.9-1,2.4-1,3c0,1.4,1,2.2,3,2.4c0.4,0.1,0.6,0.2,0.6,0.4 c0,0.3-0.2,0.5-0.6,0.5c-0.2,0-0.6,0-0.9-0.1c-0.8-0.2-1.4-0.2-2-0.2c-0.6,0-1.2,0-3.5,0.3l-0.8,0c-0.3,0-0.4-0.1-0.4-0.4 c0-0.2,0.1-0.4,0.5-0.5c1.2-0.4,1.6-0.9,3.1-4.3l4.6-10.6c0.4-0.8,0.7-1.4,0.8-1.7l1.6-3.2c1.4-2.8,1.4-2.8,1.5-2.8 c0.2,0,0.7,0.8,1.3,2.3L318.8,35.1z"/>
                        <path fill="#fff" d="M42.5,17.4l3.9-16.9H23.2c-4.4,0-7.6,0.6-10.1,1.7C9.9,3.7,7.8,6.4,7,9.9L2.9,27.8c-0.7,3-0.3,5.5,1.2,7.4 c2,2.5,5.5,3.6,11.6,3.6h21.9l3-13.2H22.7l1.9-8.1H42.5z"/>
                        <path fill="#112e51" d="M20.3,27.4h17.9l-2.1,9.3H15.8c-5.5,0-8.5-0.8-10.1-2.8c-1.1-1.4-1.4-3.3-0.8-5.7l4.1-17.9 c0.7-2.9,2.4-5.1,5-6.3c2.2-1.1,5.2-1.6,9.3-1.6h20.7l-3,12.9H27.1l0.8-3.6h-4L20.3,27.4z"/>
                        <path fill="#fdb736" d="M42.4,3.8L40,14H28.9l0.8-3.6h-6.8l-4.2,18.4h17.9l-1.5,6.6H15.9c-7.2,0-10.9-1.4-9.6-6.8l4.1-17.9 c1.2-5.3,5.9-6.8,13-6.8H42.4z"/>
                    </g>
                    </svg>
                    <h1 className="text-yellow-500 py-8 text-5xl">Welcome to ChattUTC!</h1>
                    <button
                        onClick={() => signIn('cognito')}
                        style={{
                            backgroundColor: 'white',
                            color: '#112e51',
                            fontWeight: 'bold',
                            padding: '10px 20px',
                            cursor: 'pointer',
                            transition: 'background-color 0.3s ease-in-out',
                            fontFamily: 'Raleway, sans-serif',
                            borderColor: '#112e51',
                            fontSize: '125%',
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fdb736'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                        Log In
                    </button>
                </div>
            </main>
        );
    }
};
export default Home;

export const getServerSideProps: GetServerSideProps = async ({ locale }) => {
    const defaultModelId =
        (process.env.DEFAULT_MODEL &&
            Object.values(ModelID).includes(
                process.env.DEFAULT_MODEL as ModelID,
            ) &&
            process.env.DEFAULT_MODEL) ||
        fallbackModelID;

    const chatEndpoint = process.env.CHAT_ENDPOINT;
    const mixPanelToken = process.env.MIXPANEL_TOKEN;
    const cognitoClientId = process.env.COGNITO_CLIENT_ID;
    const cognitoDomain = process.env.COGNITO_DOMAIN;
    const defaultFunctionCallModel = process.env.DEFAULT_FUNCTION_CALL_MODEL;
    const availableModels = process.env.AVAILABLE_MODELS;



    // const googleApiKey = process.env.GOOGLE_API_KEY;
    // const googleCSEId = process.env.GOOGLE_CSE_ID;
    // if (googleApiKey && googleCSEId) {
    //     serverSidePluginKeysSet = true;
    // }

    return {
        props: {
            availableModels,
            chatEndpoint,
            defaultModelId,
            mixPanelToken,
            cognitoClientId,
            cognitoDomain,
            defaultFunctionCallModel,
            ...(await serverSideTranslations(locale ?? 'en', [
                'common',
                'chat',
                'sidebar',
                'markdown',
                'promptbar',
                'settings',
            ])),
        },
    };
};
