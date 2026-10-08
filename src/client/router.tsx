import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
} from "@tanstack/react-router";
import { RootLayout } from "./shell/root-layout";
import { InboxPage } from "./pages/inbox-page";
import { ApplicationsPage } from "./pages/applications-page";
import { DashboardPage } from "./pages/dashboard-page";
import { SetupPage } from "./pages/setup-page";
import { JobDetailPage } from "./pages/job-detail-page";
import { z } from "zod";

const inboxSearchSchema = z.object({
  q: z.string().max(200).catch(""),
  segment: z.enum(["all", "recommended", "marginal", "saved", "dismissed", "hidden"]).catch("all"),
  sort: z.enum(["fit_desc", "date_desc", "salary_desc"]).catch("fit_desc"),
  workplaceType: z.enum(["all", "remote", "hybrid", "onsite"]).catch("all"),
  source: z.string().max(120).catch("all"),
  missingSalary: z.preprocess((value) => value === true || value === "true", z.boolean()).catch(false),
  missingLocation: z.preprocess((value) => value === true || value === "true", z.boolean()).catch(false),
});

// 1. Root route housing persistent shell (left rail, outlet, mobile bar)
const rootRoute = createRootRoute({
  component: RootLayout,
});

// 2. Index route redirects to /inbox
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/inbox" });
  },
});

// 3. Inbox Route
const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inbox",
  validateSearch: inboxSearchSchema,
  component: InboxPage,
});

// 4. Applications Route
const applicationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/applications",
  component: ApplicationsPage,
});

// 5. Dashboard Route
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPage,
});

// 6. Setup Route
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  component: SetupPage,
});

// 7. Job detail route
const jobDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/jobs/$id",
  component: JobDetailPage,
});

// 7. Route tree aggregation
const routeTree = rootRoute.addChildren([
  indexRoute,
  inboxRoute,
  applicationsRoute,
  dashboardRoute,
  setupRoute,
  jobDetailRoute,
]);

// 8. Create typed router instance
export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

// Register router for complete TypeScript auto-completion across codebase
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
