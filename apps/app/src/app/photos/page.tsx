import { PageHeader, Card } from "@o/ui";
import { PhotoUploader } from "./_components/uploader";
import { PhotoGallery } from "./_components/gallery";
import { Sparkles, Clock, DollarSign } from "lucide-react";

// =============================================================================
// o.company · client photo portal
// =============================================================================
// This is what O'Shay's client sees when they open their gallery. The flow:
//   1. Drop phone photos
//   2. Pick a preset (or write your own variation set)
//   3. Submit
//   4. Wait ~20 seconds
//   5. See variations, download the ones they want
//
// In dev, the gallery is fed by mock data. In prod it polls the API for
// real jobs. The same component handles both.

export default function PhotosPage() {
  return (
    <>
      <PageHeader
        title="Photo pipeline"
        subtitle="Drop your photos. Pick a preset. Get variations back in under a minute."
      />
      <div className="grid gap-4 lg:grid-cols-3 mb-8">
        <Card className="lg:col-span-2">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-accent mt-1" />
            <div>
              <h2 className="font-serif text-xl text-cream">Send photos. Get variations.</h2>
              <p className="mt-1 text-sm text-cream3 leading-relaxed">
                Drop up to 50 photos at a time. We run them through our pipeline
                and send back the preset you chose. Background removed, color
                graded, upscaled, cropped — whatever you ask for. Files are
                private to your account; nobody else sees them.
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <Clock className="h-4 w-4 text-cream3" />
            <p className="text-sm text-cream3">Typical turnaround</p>
          </div>
          <p className="font-serif text-2xl text-cream">~20s</p>
          <p className="mt-1 text-xs text-cream3">per photo, per preset</p>
          <div className="mt-4 flex items-center gap-3">
            <DollarSign className="h-4 w-4 text-cream3" />
            <p className="text-sm text-cream3">Typical cost</p>
          </div>
          <p className="font-serif text-2xl text-cream">$0.12</p>
          <p className="mt-1 text-xs text-cream3">per photo, per preset</p>
        </Card>
      </div>
      <PhotoUploader />
      <PhotoGallery />
    </>
  );
}
