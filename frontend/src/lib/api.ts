const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include', // sends the httpOnly session cookie
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? 'unknown_error', body?.error?.message ?? 'Something went wrong.');
  }
  return body as T;
}

export const api = {
  register: (email: string, password: string, displayName: string) =>
    request<{ userId: string; message: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName }) }),

  login: (email: string, password: string) =>
    request<{ requiresOtp: boolean; userId: string; theme?: 'light' | 'dark' }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  verifyOtp: (userId: string, otp: string, purpose: 'registration' | 'login', trustDevice?: boolean) =>
    request<{ verified: boolean; theme?: 'light' | 'dark' }>('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ userId, otp, purpose, trustDevice }) }),

  resendOtp: (email: string, purpose: 'registration' | 'login' | 'password_reset') =>
    request<{ message: string }>('/auth/resend-otp', { method: 'POST', body: JSON.stringify({ email, purpose }) }),

  logout: () => request('/auth/logout', { method: 'POST' }),

  getMe: () =>
    request<{
      id: string; email: string; role: string; plan_code: string; theme_preference: string;
      display_name: string; bio: string | null; country: string | null; city: string | null; preferred_language?: string;
    }>('/users/me'),

  updateTheme: (theme: 'auto' | 'light' | 'dark') =>
    request('/users/me/theme', { method: 'PATCH', body: JSON.stringify({ theme }) }),

  listSessions: () => request<Array<{ id: string; ip_address: string; device_info: string; created_at: string; isCurrent: boolean }>>('/users/me/security/sessions'),
  revokeSession: (id: string) => request(`/users/me/security/sessions/${id}`, { method: 'DELETE' }),
  listLoginHistory: (page = 1) => request<Array<any>>(`/users/me/security/login-history?page=${page}`),
  listTrustedDevices: () => request<Array<any>>('/users/me/security/trusted-devices'),
  removeTrustedDevice: (id: string) => request(`/users/me/security/trusted-devices/${id}`, { method: 'DELETE' }),

  listCourses: () => request<Array<{ id: string; title: string; slug: string; description: string; is_premium: boolean; required_plan_code: string; category_name: string; instructor_name: string }>>('/courses'),
  getCourse: (slug: string) => request<any>(`/courses/${slug}`),
  getVideo: (id: string) => request<{ id: string; course_id: string; title: string; description: string; duration_seconds: number; is_premium: boolean; required_plan_code: string; course_slug: string | null; course_title: string | null; next_video: { id: string; title: string } | null; resume_position: number; completed: boolean; thumbnail_url?: string | null }>(`/videos/${id}`),
  getStreamUrl: (id: string) => request<{ streamUrl: string; mock: boolean; note?: string }>(`/videos/${id}/stream-url`),
  saveProgress: (id: string, positionSeconds: number) => request<{ completed: boolean }>(`/videos/${id}/progress`, { method: 'POST', body: JSON.stringify({ positionSeconds }) }),
  getCourseProgress: (courseId: string) => request<{ total: number; completed: number; percent: number }>(`/courses/${courseId}/progress`),

  listPlans: () => request<Array<{ code: string; name: string; price_inr: string; streaming_quality: string; download_daily_limit: number; live_room_access: string; premium_track_access: string }>>('/plans'),
  getMySubscription: () => request<any>('/subscriptions/me'),
  checkout: (planCode: string) => request<{ orderId: string; amount: number; currency: string; keyId: string }>('/subscriptions/checkout', { method: 'POST', body: JSON.stringify({ planCode }) }),
  cancelSubscription: () => request('/subscriptions/cancel', { method: 'POST' }),
  listInvoices: () => request<Array<any>>('/billing/invoices'),
  getInvoice: (id: string) => request<any>(`/billing/invoices/${id}`),

  requestDownload: (videoId: string) => request<any>('/downloads', { method: 'POST', body: JSON.stringify({ videoId }) }),
  listDownloads: () => request<Array<any>>('/downloads'),
  getQuota: () => request<{ planCode: string; limit: number | 'unlimited'; used: number; remaining: number | 'unlimited' }>('/downloads/quota'),

  listComments: (videoId: string, sort = 'newest', page = 1) => request<Array<any>>(`/videos/${videoId}/comments?sort=${sort}&page=${page}`),
  listReplies: (commentId: string) => request<Array<any>>(`/comments/${commentId}/replies`),
  editComment: (id: string, content: string) => request<any>(`/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ content }) }),
  deleteComment: (id: string) => request<{ deleted: boolean }>(`/comments/${id}`, { method: 'DELETE' }),
  postComment: (videoId: string, content: string, parentCommentId?: string) =>
    request<any>(`/videos/${videoId}/comments`, { method: 'POST', body: JSON.stringify({ content, parentCommentId }) }),
  likeComment: (id: string, voteType: 'like' | 'dislike') => request(`/comments/${id}/like`, { method: 'POST', body: JSON.stringify({ voteType }) }),
  translateComment: (id: string, targetLanguage: string) => request<{ translated: string }>(`/comments/${id}/translate`, { method: 'POST', body: JSON.stringify({ targetLanguage }) }),
  reportComment: (id: string, reason: string) => request(`/comments/${id}/report`, { method: 'POST', body: JSON.stringify({ reason }) }),

  createMeeting: (data: any) => request<any>('/meetings', { method: 'POST', body: JSON.stringify(data) }),
  joinMeeting: (roomCode: string) => request<any>(`/meetings/${roomCode}/join`, { method: 'POST' }),
  getMeeting: (id: string) => request<{ meeting: any; participants: Array<{ user_id: string; participant_role: string; mic_state: string; camera_state: string; display_name: string; connection_quality?: string | null; is_muted_by_host?: boolean; can_share_screen?: boolean; can_chat?: boolean }> }>(`/meetings/${id}`),
  meetingHistory: () => request<Array<any>>('/meetings/history'),
};
