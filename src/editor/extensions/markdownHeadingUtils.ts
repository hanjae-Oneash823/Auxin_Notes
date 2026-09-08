/** ATX heading node names → level. Shared by `hideSyntaxPlugin.ts` (styles
 *  and replaces a heading's own line) and `headingFoldPlugin.ts` (needs the
 *  same level info to find where a collapsed section ends) so the two can't
 *  drift apart on what counts as a heading. */
export const HEADING_LEVEL: Record<string, number> = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
};
