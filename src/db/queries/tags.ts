import type Database from '@tauri-apps/plugin-sql';

export interface TagCount {
  name: string;
  count: number;
}

export async function listTagsWithCounts(db: Database): Promise<TagCount[]> {
  return db.select<TagCount[]>(
    `SELECT t.name as name, COUNT(nt.note_id) as count
     FROM tags t
     JOIN note_tags nt ON nt.tag_id = t.id
     JOIN notes n ON n.id = nt.note_id AND n.is_deleted = 0
     GROUP BY t.id
     HAVING count > 0
     ORDER BY t.name`,
  );
}
