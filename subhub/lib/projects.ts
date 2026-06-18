// Projects: a coordination layer over multiple Jobs for one customer
// engagement (migration 022). Jobs stay independently postable/claimable/
// payable; the Project rolls them up under one tile with optional sequencing.

import { supabase } from './supabase';
import type { Project, ProjectProgress, Job } from './types';

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const projects = (data ?? []) as Project[];
  // Hydrate progress per project (cheap RPC each; fine at MVP volume).
  await Promise.all(projects.map(async p => {
    const { data: prog } = await supabase.rpc('project_progress', { p_project: p.id });
    p.progress = (Array.isArray(prog) ? prog[0] : prog) as ProjectProgress;
  }));
  return projects;
}

export async function getProject(id: string): Promise<Project | null> {
  const [{ data: project }, { data: jobs }, { data: prog }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', id).single(),
    supabase.from('jobs').select('*').eq('project_id', id).order('sequence_order', { nullsFirst: false }),
    supabase.rpc('project_progress', { p_project: id }),
  ]);
  if (!project) return null;
  return {
    ...(project as Project),
    jobs: (jobs ?? []) as Job[],
    progress: (Array.isArray(prog) ? prog[0] : prog) as ProjectProgress,
  };
}

export async function createProject(input: {
  title: string;
  customer_name?: string;
  description?: string;
  target_date?: string;
}): Promise<Project> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('projects')
    .insert({ ...input, contractor_id: user!.id })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Project;
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  const { error } = await supabase.from('projects').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// Attach / detach a job from a project, with optional sequencing.
export async function setJobProject(
  jobId: string,
  projectId: string | null,
  sequenceOrder?: number,
): Promise<void> {
  const patch: any = { project_id: projectId };
  if (sequenceOrder !== undefined) patch.sequence_order = sequenceOrder;
  const { error } = await supabase.from('jobs').update(patch).eq('id', jobId);
  if (error) throw new Error(error.message);
}
