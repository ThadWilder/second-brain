-- Phone numbers for masked VoIP calling through SubHub
alter table contractor_profiles add column if not exists phone_number text;
alter table sub_profiles add column if not exists phone_number text;
