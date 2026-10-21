'use client';
import { useQuery } from '@tanstack/react-query';
import type { CurrentUser, WorkspaceView } from '@sales/shared';
import { api } from './api';
export const useUser = () => useQuery({ queryKey: ['user'], queryFn: () => api<CurrentUser>('/auth/me') });
export const useWorkspace = () => useQuery({ queryKey: ['workspace'], queryFn: () => api<WorkspaceView>('/workspaces/current') });
