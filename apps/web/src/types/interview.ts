/**
 * APTLY — Phase 2 Interview, Speech & Content Intelligence Types
 */

export type InterviewStatus =
  | "created"
  | "ready"
  | "running"
  | "question_active"
  | "answering"
  | "answer_submitted"
  | "processing"
  | "next_question"
  | "completing"
  | "completed"
  | "failed";

export type QuestionType =
  | "introductory"
  | "behavioral"
  | "technical"
  | "project"
  | "situational"
  | "system_design";

export type ClaimSupportStatus =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "UNSUPPORTED"
  | "NOT_ASSESSABLE";

export type EvidenceType =
  | "STRENGTH"
  | "WEAKNESS"
  | "CLAIM"
  | "STAR"
  | "FEEDBACK"
  | "TECHNICAL_POINT";

export interface RoleProfile {
  id: string;
  job_id: string;
  role_title: string;
  seniority: string;
  domain: string;
  technical_skills: string[];
  tools: string[];
  responsibilities: string[];
  behavioral_competencies: string[];
  interview_topics: string[];
  preferred_experience: string[];
  prompt_version: string;
  created_at: string;
}

export interface Job {
  id: string;
  title: string | null;
  company: string | null;
  raw_text: string;
  role_profile?: RoleProfile;
  created_at: string;
}

export interface Question {
  id: string;
  interview_id: string;
  sequence_number: number;
  category: "technical" | "behavioral" | "situational" | string;
  question_type: string;
  competency: string;
  difficulty: "easy" | "medium" | "hard" | string;
  question_text: string;
  expected_topics: string[];
  prompt_version: string;
  parent_question_id?: string | null;
  root_question_id?: string | null;
  question_source?: "initial" | "follow_up" | string;
  follow_up_depth?: number;
  target_competency?: string;
}

export interface FillerOccurrence {
  word: string;
  timestamp_seconds: number;
  duration_seconds: number;
}

export interface PauseOccurrence {
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
}

export interface SpeechMetrics {
  id: string;
  answer_id: string;
  wpm: number;
  speaking_duration_seconds: number;
  total_words: number;
  filler_count: number;
  filler_density: number;
  filler_words: FillerOccurrence[];
  pause_count: number;
  total_pause_seconds: number;
  pauses: PauseOccurrence[];
  voice_energy?: {
    average_energy: number;
    energy_variance: number;
    opening_energy: number;
    middle_energy: number;
    closing_energy: number;
    timeline: Array<{ timestamp_seconds: number; energy: number }>;
  } | null;
  created_at: string;
}

export interface TranscriptWord {
  word: string;
  start_seconds: number;
  end_seconds: number;
  confidence?: number;
}

export interface Transcript {
  id: string;
  answer_id: string;
  full_text: string;
  word_count: number;
  language: string;
  segments: unknown[];
  words: TranscriptWord[];
  model_provider: string;
  model_version: string;
  created_at: string;
}

export interface StarComponent {
  present: boolean;
  quality: number;
  evidence_text?: string | null;
  start_seconds?: number | null;
  end_seconds?: number | null;
}

export interface StarAnalysis {
  situation: StarComponent;
  task: StarComponent;
  action: StarComponent;
  result: StarComponent;
  missing_components: string[];
}

export interface ClaimItem {
  claim: string;
  support_status: ClaimSupportStatus;
  evidence_quote?: string | null;
  start_seconds?: number | null;
}

export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  text: string;
  start_seconds: number;
  end_seconds: number;
  confidence: number;
}

export interface FeedbackItem {
  observation: string;
  impact: string;
  action: string;
}

export interface PracticeDrill {
  title: string;
  duration_seconds: number;
  instructions: string;
  repeat_count: number;
}

export interface ContentMetrics {
  id: string;
  answer_id: string;
  question_type: QuestionType | string;
  relevance_score: number;
  technical_depth_score: number;
  completeness_score: number;
  structure_score: number;
  evidence_score: number;
  overall_content_score: number;
  strengths: string[];
  weaknesses: string[];
  star_analysis?: StarAnalysis | null;
  claims: ClaimItem[];
  evidence: EvidenceItem[];
  feedback: FeedbackItem[];
  practice_drills: PracticeDrill[];
  reasoning_summary: string;
  provider: string;
  model: string;
  prompt_version: string;
  created_at: string;
}

export interface Answer {
  id: string;
  interview_id: string;
  question_id: string;
  sequence_number: number;
  status: string;
  duration_seconds: number;
  started_at?: string | null;
  ended_at?: string | null;
  audio_storage_key?: string | null;
  audio_size_bytes?: number | null;
  playback_url?: string | null;
  transcript?: Transcript | null;
  speech_metrics?: SpeechMetrics | null;
  content_metrics?: ContentMetrics | null;
  created_at: string;
}

export interface InterviewDetail {
  id: string;
  title: string;
  status: InterviewStatus;
  interview_type: string;
  difficulty_level: string;
  target_duration_minutes: number;
  current_question_index: number;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  role_profile?: RoleProfile | null;
  questions: Question[];
  answers: Answer[];
}

export interface QuestionReviewItem {
  question: Question;
  answer?: Answer | null;
  transcript?: Transcript | null;
  speech_metrics?: SpeechMetrics | null;
  content_metrics?: ContentMetrics | null;
}

export interface TopHabitItem {
  rank: number;
  habit_type: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | string;
  metric_value: string;
  evidence_summary: string;
  impact_explanation: string;
  recommended_drill: {
    title: string;
    duration_seconds: number;
    instructions: string;
    success_criteria: string;
  };
}

export interface InterviewReview {
  interview: {
    id: string;
    title: string;
    status: InterviewStatus;
    interview_type: string;
    difficulty_level: string;
    target_duration_minutes: number;
    current_question_index: number;
    started_at?: string | null;
    completed_at?: string | null;
    created_at: string;
  };
  role_profile?: RoleProfile | null;
  total_duration_seconds: number;
  total_answers_count: number;
  average_wpm: number;
  total_fillers_count: number;
  overall_filler_density: number;
  total_pauses_count: number;
  average_content_score?: number;
  average_relevance_score?: number;
  average_technical_depth_score?: number;
  overall_delivery_score?: number;
  overall_composite_score?: number;
  top_habits?: TopHabitItem[];
  questions_review: QuestionReviewItem[];
}
