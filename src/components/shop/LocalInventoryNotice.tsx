import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useShopContext } from "@/context/ShopContext";

/** Report actual reconciliation conflicts without covering the game or audio. */
export default function LocalInventoryNotice() {
  const shop = useShopContext();
  const signature = `${shop.user?.id ?? ""}:${shop.localItemConflicts.map((entry) => entry.operationId).join(",")}`;
  const shown = useRef("");
  const latest = useRef(shop);
  latest.current = shop;
  useEffect(() => {
    const current = latest.current;
    if (
      current.user?.role !== "player" ||
      !current.localItemConflicts.length ||
      shown.current === signature
    )
      return;
    shown.current = signature;
    toast.warning("La Bag se actualizó con el inventario central", {
      id: `inventory-conflict:${current.user.id}`,
      description:
        "Algunas existencias ya se habían utilizado. Se conservaron tus acciones locales y se corrigieron las cantidades de la Bag.",
      action: {
        label: "Entendido",
        onClick: () => {
          void latest.current
            .dismissLocalItemConflicts()
            .catch(() =>
              toast.error("No se pudo guardar la confirmación del aviso."),
            );
        },
      },
    });
  }, [signature]);
  return null;
}
