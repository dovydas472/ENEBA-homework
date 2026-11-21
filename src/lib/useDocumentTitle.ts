import { useEffect } from "react";
import { pageTitle } from "./pageTitle.ts";

/** Sets the browser tab title for the page that calls it: useDocumentTitle("Store"). No argument = home. */
export function useDocumentTitle(page?: string) {
  useEffect(() => {
    document.title = pageTitle(page);
  }, [page]);
}
