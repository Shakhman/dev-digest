/* Route: /repos/:repoId/project-context — Project Context screen (SPEC-08 T-U1).
   Discover repo Markdown with source badges, token sizes, usage counts, and
   a read-only Markdown preview. The footer shows the existing repo-intel chunk count. */
import { ContextFileList } from "./_components/ContextFileList";

export default function ProjectContextPage() {
  return <ContextFileList />;
}
