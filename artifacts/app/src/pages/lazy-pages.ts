import { lazyModule } from "@/lib/lazy-module";

// Routes that are not the first screen. They live in their own chunks so the
// landing page and Home do not download them; Index prefetches Tracker when the
// Stats tab is hovered.
export const TrackerPage = lazyModule(() => import("./Tracker"));
export const SharedLibraryPage = lazyModule(() => import("./SharedLibrary"));
