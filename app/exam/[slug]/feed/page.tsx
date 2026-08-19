import { notFound } from "next/navigation";
import { EXAMS, getExamBySlug } from "../../../../content/registry";
import FeedClient from "./feed-client";

export function generateStaticParams() {
  return EXAMS.map((e) => ({ slug: e.manifest.slug }));
}

export default async function FeedPage({ params }: PageProps<"/exam/[slug]/feed">) {
  const { slug } = await params;
  if (!getExamBySlug(slug)) notFound();
  return <FeedClient slug={slug} />;
}
