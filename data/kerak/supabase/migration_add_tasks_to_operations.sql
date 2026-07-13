-- Add tasks column to operations table
ALTER TABLE operations 
ADD COLUMN IF NOT EXISTS tasks JSONB DEFAULT '[]'::jsonb;

-- Create an index for faster querying of tasks if needed (optional but good practice)
CREATE INDEX IF NOT EXISTS operations_tasks_idx ON operations USING gin (tasks);
