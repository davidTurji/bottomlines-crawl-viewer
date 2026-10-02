/**
 * Rows per page, on every list in the report (David, 2026-10-02: "25 per
 * page, on all pages"). One number, so the overview's publishers and apps,
 * Changes, Discovery and Declarations can never drift apart again: they
 * were 250, 250, 40, 50 and 25.
 *
 * Short pages are the point. A page of 25 fits in a scroll or two, so the
 * pager above the list and the one below it are both close at hand, and
 * moving on is a click rather than a hunt.
 *
 * The crawler API takes any page_size from 1 up (viewer_v2.py), so this is a
 * client choice and changes nothing in a frozen report.
 */
export const PAGE_SIZE = 25;
