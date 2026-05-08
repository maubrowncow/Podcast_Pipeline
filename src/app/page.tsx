import Link from "next/link";
import { JobList } from "@/components/job-list";
import { buttonVariants } from "@/components/ui/button-variants";

export default function DashboardPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xs font-bold uppercase tracking-[0.14em]">
          Transcription Jobs
        </h1>
        <Link
          href="/upload"
          className={buttonVariants({ variant: "default", size: "sm" })}
        >
          Upload Audio
        </Link>
      </div>
      <JobList />
    </div>
  );
}
