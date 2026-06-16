ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS notify_pipeline_create  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_pipeline_update  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_pipeline_delete  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_pipeline_reorder boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_stage_create     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_stage_update     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_stage_delete     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_stage_reorder    boolean NOT NULL DEFAULT true;