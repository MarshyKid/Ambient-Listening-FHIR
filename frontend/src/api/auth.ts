import { apiBaseUrl } from "./config";

export interface AuthMeResponse {
    authenticated: boolean;
    user?: {
        name?: string;
        email?: string;
        nickname?: string;
        picture?: string;
        sub?: string;
        [key: string]: unknown;
    };
}

export async function getAuthMe(): Promise<AuthMeResponse> {
    const response = await fetch(`${apiBaseUrl}/api/auth/me`, {
        credentials: "include"
    });

    if (!response.ok) {
        return { authenticated: false };
    }

    return response.json();
}

export function login() {
    window.location.href = `${apiBaseUrl}/api/auth/login`;
}

export function logout() {
    window.location.href = `${apiBaseUrl}/api/auth/logout`;
}
