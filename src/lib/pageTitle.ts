import { APP_NAME } from "./appInfo.ts";

/** The text of the browser tab: "Store – EneHomeworkBa"; the home page (no name) gets the long title. */
export function pageTitle(page?: string): string {
  return page ? `${page} – ${APP_NAME}` : `${APP_NAME} – internship demo`;
}
