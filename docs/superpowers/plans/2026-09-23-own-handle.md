# Plan: the own-handle trust rule (Paul's ● low on PR 255, `outline-top-content.ts:56`)

> One finding. Every statement read from the code while writing, with the command in brackets.
> **Conclusion: his suggested rule cannot be implemented, and this is proven by an existing
> passing test, not argued.** What ships is a corrected log line, a test that pins why, and his
> second option filed.

## Paul, verbatim

> (low) This distrusts a correct handle whenever no Instagram post in the window is authored by
> the client. For example, a month where the client's only posts are collabs authored by
> partners. The rule then falls back to #ad, collab posts without #ad land in the owned Top 5,
> and the log says "own handle matches no post author," which is wrong. Rare, but it's a
> client-facing list. Consider distrusting only when every authored post shares one author that
> isn't the stored handle (what a rename looks like), or validating the handle once when it's
> saved.

**His diagnosis is correct.** The disagreement is only with his first suggested remedy.

## What the code does

```ts
export function handleMatchesNoAuthor(posts, own) {
  if (!own.INSTAGRAM) return false
  const authors = posts.filter((p) => p.channel === 'INSTAGRAM' && p.author).map((p) => p.author)
  return authors.length > 0 && !authors.includes(own.INSTAGRAM)
}
```
[`grep -n "export function handleMatchesNoAuthor" -A 6 lib/organic-social/outline-top-content.ts`]

When it returns true the caller clears the handle and the `#ad` rule takes over
[`grep -n "own handle matches no post author" -B 2 -A 2 components/report-sections/organic-social/parts/top-content-outline.tsx`].

## Why his first option cannot be implemented

There is already a passing test encoding the opposite requirement
[`sed -n '36,43p' lib/organic-social/outline-top-content.test.ts`]:

```ts
const own = { INSTAGRAM: 'old_handle' }
expect(handleMatchesNoAuthor([P(1, { author: 'brand_handle' }), P(2, { author: 'creator_one' }), P(3)], own)).toBe(true)
```

That is a renamed account (`brand_handle` now, `old_handle` stored) whose window also holds one
partner collab (`creator_one`). **Two distinct authors.** Under his rule, distrust only when
there is exactly one distinct author, this returns false, the stale handle is trusted, every post
is stamped `influencer`, and the client's owned Top 5 renders empty. So his rule both breaks that
test and regresses a client-facing list.

The two cases are indistinguishable at this function:

| | what the function sees | correct answer |
|---|---|---|
| Paul's case: correct handle, month of partner collabs | authors exist, none is the handle, 2+ distinct | **trust** |
| The test's case: stale handle, client posted under a new name | authors exist, none is the handle, 2+ distinct | **distrust** |

Identical input, opposite correct answers. No rule over author names separates them. His single
distinct author variant does not either: a month whose only posts are collabs by ONE partner
looks exactly like a clean rename.

**His second option is the only correct fix**, and it works precisely because it moves the
decision to where the information exists: at save time the handle can be checked against Dash
directly, instead of inferred from whoever happened to post this month.

## What ships here

1. **No behaviour change.** `handleMatchesNoAuthor` is untouched. Changing it breaks a passing
   test that encodes a real case, to fix a rarer one.
2. **The log line, which is the part of his finding that IS safely fixable.** Today it reads
   `own handle matches no post author`, which states a fact and implies a conclusion (the handle
   is stale) that the data does not support. It will name both possibilities so whoever reads it
   at 3am is not sent down the wrong path.
3. **A test pinning the indistinguishability**, as executable documentation, so the next person
   to read Paul's comment does not spend the afternoon rediscovering it.
4. **His option 2 filed** with both cases named.

## Tests

- The rename-plus-collab case still distrusts (re-pinning the existing behaviour his rule breaks).
- The partner-collab-with-a-correct-handle case still distrusts, with a comment naming it as the
  known false positive and pointing at the follow-up. Pinning the wrong answer deliberately is
  the honest record: it is what the code does, and a test asserting otherwise would be fiction.
- Both cases produce byte-identical inputs to the function, asserted directly, which is the proof
  that no author-name rule can split them.

## Not done

`handleMatchesNoAuthor` is not changed. `missingAuthors` is not touched, it is a different
condition he did not raise. Handle validation on save is filed, not built: it is a write-path
change in the switch-on script and the admin surface, which is a different PR.
