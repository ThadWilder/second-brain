import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

// Count of messages addressed to me that I haven't read yet. RLS already
// scopes the messages table to jobs I'm a party to, so "not sent by me and
// unread" is exactly my inbound unread count. Refreshes live on any message
// insert/update (new message arrives, or I read one).
export function useUnreadMessages(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCount(0); return; }
    const { count: c } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .neq('sender_id', user.id);
    setCount(c ?? 0);
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel('unread-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => { refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  return count;
}
