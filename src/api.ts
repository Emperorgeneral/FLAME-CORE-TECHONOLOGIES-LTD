import type { BlogPost } from './siteContent';
import { defaultBlogPosts } from './siteContent';

export type ContactPayload = {
  name: string;
  email: string;
  company?: string;
  message: string;
};

export type MailPayload = {
  subject: string;
  body: string;
  recipientsMode: 'all_contacts' | 'custom';
  customRecipients?: string;
};

export type AdminOverview = {
  postCount: number;
  publishedCount: number;
  leadCount: number;
  mailCount: number;
};

export type ContactLead = {
  id: number;
  name: string;
  email: string;
  company?: string | null;
  message: string;
  createdAt: string;
};

export type MailHistoryItem = {
  id: number;
  subject: string;
  senderEmail: string;
  recipients: string[];
  recipientCount: number;
  status: string;
  createdAt: string;
};

const jsonHeaders = { 'Content-Type': 'application/json' };

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'include',
    headers: {
      ...jsonHeaders,
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchPublishedPosts(): Promise<BlogPost[]> {
  try {
    const data = await request<{ posts: BlogPost[] }>('/api/posts?published=1');
    return data.posts.length ? data.posts : defaultBlogPosts;
  } catch {
    return defaultBlogPosts;
  }
}

export async function submitContact(payload: ContactPayload) {
  return request<{ success: true; message: string }>('/api/contact', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loginAdmin(email: string, password: string) {
  return request<{ success: true; user: { email: string } }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getAdminSession() {
  return request<{ authenticated: boolean; user: { email: string } }>('/api/auth/me');
}

export async function logoutAdmin() {
  return request<{ success: true }>('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
}

export async function getAdminOverview() {
  return request<AdminOverview>('/api/admin/overview');
}

export async function getAdminPosts() {
  return request<{ posts: BlogPost[] }>('/api/admin/posts');
}

export async function saveAdminPost(post: Partial<BlogPost>) {
  const method = post.id ? 'PUT' : 'POST';
  const path = post.id ? `/api/admin/posts/${post.id}` : '/api/admin/posts';
  return request<{ success: true; post: BlogPost }>(path, {
    method,
    body: JSON.stringify(post),
  });
}

export async function deleteAdminPost(id: number) {
  return request<{ success: true }>(`/api/admin/posts/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}

export async function getContactLeads() {
  return request<{ contacts: ContactLead[] }>('/api/admin/contacts');
}

export async function getMailHistory() {
  return request<{ messages: MailHistoryItem[] }>('/api/admin/mail/history');
}

export async function sendAdminMail(payload: MailPayload) {
  return request<{ success: true; delivered: number; skipped: number; message: string }>('/api/admin/mail/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadAdminMedia(file: File, kind: 'image' | 'video') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('kind', kind);

  const response = await fetch('/api/admin/upload', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message || `Upload failed: ${response.status}`);
  }

  return response.json() as Promise<{ success: true; url: string; filename: string }>;
}
