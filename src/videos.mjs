// 유튜브 관련 영상 (config/videos.json): 가이드 slug → [{ id, format: long|shorts, title, publishAt }]
// publishAt 이 미래인 영상(예약 공개 전)은 빼고, format 이 없으면 제목의 #shorts 로 판단한다.
export const isVideoId = (id) => /^[\w-]{11}$/.test(id ?? '');
export const isShorts = (v) => (v.format ? v.format === 'shorts' : /#shorts/i.test(v.title ?? ''));

export function publicVideos(list, now = Date.now()) {
  return (list ?? []).filter((v) => !v.publishAt || Date.parse(v.publishAt) <= now);
}

// 형식 검사 (빌드 경고·매일 점검·가져오기에서 같이 쓴다)
export function videoIssues(data, slugs) {
  const out = [];
  for (const [slug, list] of Object.entries(data ?? {})) {
    if (slug.startsWith('_')) continue;
    if (!slugs.has(slug)) out.push(`${slug}: 없는 가이드 slug`);
    if (!Array.isArray(list)) {
      out.push(`${slug}: 목록(배열)이 아님`);
      continue;
    }
    for (const v of list) {
      const at = `${slug} · ${v?.id ?? '(id 없음)'}`;
      if (!isVideoId(v?.id)) out.push(`${at}: 영상 id 형식 오류`);
      if (!v?.title) out.push(`${at}: 제목 없음`);
      if (v?.format && !['long', 'shorts'].includes(v.format)) out.push(`${at}: format 은 long 또는 shorts`);
      if (v?.publishAt && Number.isNaN(Date.parse(v.publishAt))) out.push(`${at}: publishAt 날짜 형식 오류 "${v.publishAt}"`);
    }
  }
  return out;
}
