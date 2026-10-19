# Changes API contract fixture

`backendChanges.json` was captured from the actual authenticated FastAPI
`change-groups` and `change-groups/{key}/publishers` routes on backend commit
73bb7de. Object storage supplied a synthetic frozen artifact; every database
engine entrypoint was replaced with an assertion failure. No production report
or customer export was read to produce it.

The artifact contains 1,131 placements: 1,101 for one wide line and one each for
30 further lines. The response includes 25 groups on page one, six on page two,
and the first two 50-row pages of the wide line's publisher roster. The browser
test consumes the backend's real opaque SHA256 keys and JSON field shapes,
checks group and roster paging, reconciles a complete synthetic CSV and verifies
that an incomplete roster cannot be downloaded as a complete one.

Production still needs a post-deployment smoke test against the frozen customer
report. The local fixture is not evidence of current catalogue coverage or
production storage/network performance.
