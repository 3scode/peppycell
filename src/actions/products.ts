"use server";

import { withAction } from "@/lib/action-wrapper";
import { archiveProducts, changeProductPrices, restoreProducts, toggleProduct, upsertProduct } from "@/lib/data/repository";
import {
  productIdsSchema,
  productSchema,
  raiseProductPricesSchema,
  toggleProductSchema,
} from "@/lib/validations/product";
import type { Product } from "@/types/domain";

export const upsertProductAction = withAction(
  "upsertProduct",
  ["admin"],
  productSchema,
  async (input, { user }): Promise<Product> => await upsertProduct(user, input),
);

export const toggleProductAction = withAction(
  "toggleProduct",
  ["admin"],
  toggleProductSchema,
  async (input, { user }): Promise<Product> => await toggleProduct(user, input.id, input.isActive),
);

export const archiveProductsAction = withAction(
  "archiveProducts",
  ["admin"],
  productIdsSchema,
  async (input, { user }): Promise<{ archived: number }> => await archiveProducts(user, input.ids),
);

export const restoreProductsAction = withAction(
  "restoreProducts",
  ["admin"],
  productIdsSchema,
  async (input, { user }): Promise<{ restored: number }> => await restoreProducts(user, input.ids),
);

export const raiseProductPricesAction = withAction(
  "raiseProductPrices",
  ["admin"],
  raiseProductPricesSchema,
  async (input, { user }): Promise<{ updated: number; products: Product[] }> =>
    await changeProductPrices(user, input),
);
