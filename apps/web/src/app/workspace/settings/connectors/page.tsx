import { Suspense } from "react";
import { ConnectorsPage } from "./ConnectorsPage";

export default function ConnectorsRoute() {
  return (
    <Suspense>
      <ConnectorsPage />
    </Suspense>
  );
}
