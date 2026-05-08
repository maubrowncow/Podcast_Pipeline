import { UploadZone } from "@/components/upload-zone";

export default function UploadPage() {
  return (
    <div>
      <h1 className="text-xs font-bold uppercase tracking-[0.14em] mb-8">
        Upload Audio
      </h1>
      <UploadZone />
    </div>
  );
}
