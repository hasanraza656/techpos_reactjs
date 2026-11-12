import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useWorkspace } from "../App";
import { cachedOperations } from "../lib/sessionCache";
export function useOperations() {
  const { business, me } = useWorkspace();
  const setup = useQuery({
    queryKey: ["operations-bootstrap", business.tenant.public_id],
    queryFn: () =>
      cachedOperations(me.user.public_id, business.tenant.public_id),
    networkMode: "always",
  });
  const [branch, setBranch] = useState("");
  const [warehouse, setWarehouse] = useState("");
  useEffect(() => {
    if (setup.data && !setup.data.branches.some((b) => b.public_id === branch))
      setBranch(
        setup.data.shift?.branch ?? setup.data.branches[0]?.public_id ?? "",
      );
  }, [setup.data, branch]);
  useEffect(() => {
    if (
      setup.data &&
      !setup.data.warehouses.some(
        (w) => w.public_id === warehouse && w.branch === branch,
      )
    )
      setWarehouse(
        setup.data.warehouses.find((w) => w.branch === branch)?.public_id ?? "",
      );
  }, [setup.data, branch, warehouse]);
  return {
    business,
    me,
    setup,
    branch,
    setBranch,
    warehouse,
    setWarehouse,
    permissions:
      setup.data?.branches.find((b) => b.public_id === branch)?.permissions ??
      [],
    ready: !!branch && !!warehouse,
  };
}
