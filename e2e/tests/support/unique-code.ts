// T-486 (g) — a document-code suffix that cannot collide with an earlier run's.
//
// Four specs (pdf-review, slice-a, slice-a2, editor-review) used to build their
// document code from the clock's LAST THREE digits — a thousand values, which is
// a one-in-a-thousand chance per run of meeting the same code left behind on a
// long-lived database, where the plan refuses a repeated reference per project.
//
// This is the whole millisecond clock behind a leading `9`, never repeated inside
// one process (the clock is pushed forward if two calls land in the same
// millisecond). Three choices are deliberate:
//   - the leading `9` stays, so these rows sort where the three-digit ones did —
//     other specs open the library sorted by reference descending, and moving the
//     rows could push seeded ones off the first page;
//   - the length is fixed (14 characters until the year 2286), so no code is ever
//     a prefix of another and a `hasText` filter on one cannot also catch a longer;
//   - each spec keeps its own letters in front (`-PDF-`, `-ECO-`, `-GEO-`), so two
//     specs started in the same millisecond still differ.
let last = 0;

export function uniqueCodeSuffix(): string {
  last = Math.max(Date.now(), last + 1);
  return `9${last}`;
}
