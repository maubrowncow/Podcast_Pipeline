import { JobList } from "@/components/job-list";

export default function DashboardPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Transcription Jobs</h1>
        <a
          href="/upload"
          className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium"
        >
          Upload Audio
        </a>
      </div>
      <JobList />
    </div>
  );
}
