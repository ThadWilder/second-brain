import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

// A single row from the in-app notification feed (migration 036).
export interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  job_id: string | null;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
}

export interface UseNotifications {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

// Live feed of the current user's notifications. RLS scopes the table to the
// caller, so we just pull the latest 50 newest-first and subscribe to inserts
// to prepend new ones live (same channel/cleanup pattern as useUnreadMessages).
export function useNotifications(): UseNotifications {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setItems([]); setLoading(false); return; }
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setItems((data as NotificationItem[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      await refresh();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      channel = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const row = payload.new as NotificationItem;
            setItems((prev) => {
              if (prev.some((n) => n.id === row.id)) return prev;
              return [row, ...prev].slice(0, 50);
            });
          }
        )
        .subscribe();
    })();

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    await supabase.rpc('mark_all_notifications_read');
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
  }, []);

  const unreadCount = items.reduce((acc, n) => acc + (n.read_at ? 0 : 1), 0);

  return { items, unreadCount, loading, markAllRead, refresh };
}
