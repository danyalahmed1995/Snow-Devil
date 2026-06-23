import { invoke } from '@tauri-apps/api/core';
import { queryClient } from '../app/providers';
import { useFlowStore } from '../stores/flow-store';

export async function resetLocalCache(){await invoke('reset_local_cache');queryClient.clear();useFlowStore.setState({states:{}});}
