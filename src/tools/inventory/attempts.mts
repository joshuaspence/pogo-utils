/**
 * Looking again, for a reader that can answer differently on a second look at the same thing.
 *
 * A screenshot of a running game is not a still: the artwork animates, the clock ticks and PGSharp repaints its
 * overlay, so two shots of one screen differ over about half their rows — which `stitch.mts` measures and is why a
 * scroll capture keeps the screenshot its caller already has rather than taking a second one. Tesseract reads the two
 * differently, and that is what makes another look worth taking where a reading came out doubtful.
 *
 * It is also what makes the best of the looks worth keeping rather than the last, which is the half a retry is easy to
 * leave out: a second look can come back worse than the first, and a caller that takes whatever the last attempt said
 * has turned a doubtful answer into no answer.
 */

/**
 * The first answer nothing counts against, or the best of `tries` of them.
 *
 * `faults` is how much is wrong with an answer, as a count to be got to zero: `read` is called again while the lowest
 * count so far is above zero and there are tries left, and what comes back is the lowest-counting answer rather than
 * the last.
 *
 * The *last* of equals, though, so that a run of answers of one quality comes back as its freshest. They are the same
 * answer by the count, and whatever a caller carries out of one besides the answer — a screenshot, for the scan — is
 * least stale on the last of them. Keeping the earliest would quietly change what every caller gets on the ordinary
 * run where no attempt is better than another.
 *
 * `read` is handed the attempt's number, which is what lets a caller settle the thing before looking again without
 * this knowing what settling means for whatever is being read. It is called at least once however small `tries` is:
 * nought tries is a caller with nothing to ask for, where an answer is something only `read` can produce.
 */
export async function bestOf<T>(
  tries: number,
  faults: (answer: T) => number,
  read: (attempt: number) => Promise<T>,
): Promise<T> {
  let best: { answer: T; faults: number } | null = null;

  for (let attempt = 0; ; attempt++) {
    const answer = await read(attempt);
    const counted = faults(answer);

    if (best === null || counted <= best.faults) {
      best = { answer, faults: counted };
    }

    if (best.faults === 0 || attempt >= tries - 1) {
      return best.answer;
    }
  }
}
