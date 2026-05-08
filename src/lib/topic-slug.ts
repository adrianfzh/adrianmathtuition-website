export function topicSlug(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
