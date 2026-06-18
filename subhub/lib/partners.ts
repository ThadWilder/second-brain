// Verified partner marketplace (migration 028). Curated, clearly-labeled
// sponsored partners shown on secondary surfaces only — never in the core
// post/board/claim/message/closeout flow.

import { supabase } from './supabase';

export interface Partner {
  id: string;
  category: 'accounting' | 'financing' | 'insurance' | 'payments' | 'materials' | 'tools';
  name: string;
  blurb: string;
  cta_label: string;
  url: string;
  audience: 'contractor' | 'subcontractor' | 'both';
  weight: number;
  active: boolean;
  created_at: string;
}

export async function getRecommendedPartners(
  audience: 'contractor' | 'subcontractor',
  category?: Partner['category'],
): Promise<Partner[]> {
  const { data } = await supabase.rpc('recommended_partners', {
    p_audience: audience,
    p_category: category ?? null,
  });
  return (data ?? []) as Partner[];
}
