-- ============================================================
-- APTLY — Supabase PostgreSQL Row Level Security & Storage Policies
-- ============================================================

-- 1. Enable RLS on all user-owned tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE speech_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_metrics ENABLE ROW LEVEL SECURITY;

-- 2. Profiles Policies
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own profile"
    ON profiles FOR DELETE
    USING (auth.uid() = id);

-- 3. User Preferences Policies
CREATE POLICY "Users can view own preferences"
    ON user_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own preferences"
    ON user_preferences FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 4. User Progress Policies
CREATE POLICY "Users can view own progress"
    ON user_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
    ON user_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own progress"
    ON user_progress FOR DELETE
    USING (auth.uid() = user_id);

-- 5. User Documents Policies (Reports, Practice Plans, Coaching Summaries)
CREATE POLICY "Users can view own documents"
    ON user_documents FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own documents"
    ON user_documents FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 6. Interviews Policies
CREATE POLICY "Users can view own interviews"
    ON interviews FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own interviews"
    ON interviews FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own interviews"
    ON interviews FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own interviews"
    ON interviews FOR DELETE
    USING (auth.uid() = user_id);

-- 7. Questions Policies (Derived via Interview ownership)
CREATE POLICY "Users can view questions for own interviews"
    ON questions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interviews
            WHERE interviews.id = questions.interview_id
              AND interviews.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage questions for own interviews"
    ON questions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM interviews
            WHERE interviews.id = questions.interview_id
              AND interviews.user_id = auth.uid()
        )
    );

-- 8. Answers Policies (Derived via Interview ownership)
CREATE POLICY "Users can view answers for own interviews"
    ON answers FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM interviews
            WHERE interviews.id = answers.interview_id
              AND interviews.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage answers for own interviews"
    ON answers FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM interviews
            WHERE interviews.id = answers.interview_id
              AND interviews.user_id = auth.uid()
        )
    );

-- 9. Transcripts Policies (Derived via Answer -> Interview ownership)
CREATE POLICY "Users can view transcripts for own answers"
    ON transcripts FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM answers
            JOIN interviews ON interviews.id = answers.interview_id
            WHERE answers.id = transcripts.answer_id
              AND interviews.user_id = auth.uid()
        )
    );

-- 10. Speech Metrics Policies (Derived via Answer -> Interview ownership)
CREATE POLICY "Users can view speech metrics for own answers"
    ON speech_metrics FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM answers
            JOIN interviews ON interviews.id = answers.interview_id
            WHERE answers.id = speech_metrics.answer_id
              AND interviews.user_id = auth.uid()
        )
    );

-- 11. Content Metrics Policies (Derived via Answer -> Interview ownership)
CREATE POLICY "Users can view content metrics for own answers"
    ON content_metrics FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM answers
            JOIN interviews ON interviews.id = answers.interview_id
            WHERE answers.id = content_metrics.answer_id
              AND interviews.user_id = auth.uid()
        )
    );

-- ============================================================
-- Supabase Storage Policies (Private bucket: aptly-media)
-- Structure: users/{user_id}/interviews/{interview_id}/...
-- ============================================================

CREATE POLICY "Users can read own storage files"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'aptly-media'
        AND (storage.foldername(name))[1] = 'users'
        AND (storage.foldername(name))[2] = auth.uid()::text
    );

CREATE POLICY "Users can upload own storage files"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'aptly-media'
        AND (storage.foldername(name))[1] = 'users'
        AND (storage.foldername(name))[2] = auth.uid()::text
    );

CREATE POLICY "Users can delete own storage files"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'aptly-media'
        AND (storage.foldername(name))[1] = 'users'
        AND (storage.foldername(name))[2] = auth.uid()::text
    );
