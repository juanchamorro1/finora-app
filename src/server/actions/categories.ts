"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { categoryFormSchema } from "@/lib/validation";
import { db } from "../db";
import { createCategory, deleteCategory, setCategoryArchived, updateCategory } from "../services/categories";
import { runAction } from "./run-action";

function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function createCategoryAction(input: unknown) {
  return runAction(categoryFormSchema, input, async (data, userId) => {
    const category = await createCategory(db, userId, data);
    revalidateAll();
    return { id: category.id };
  });
}

export async function updateCategoryAction(id: string, input: unknown) {
  return runAction(categoryFormSchema.omit({ kind: true }), input, async (data, userId) => {
    await updateCategory(db, userId, id, data);
    revalidateAll();
    return { id };
  });
}

export async function setCategoryArchivedAction(id: string, archived: boolean) {
  return runAction(z.object({ id: z.string().min(1), archived: z.boolean() }), { id, archived }, async (d, userId) => {
    await setCategoryArchived(db, userId, d.id, d.archived);
    revalidateAll();
    return { id: d.id };
  });
}

export async function deleteCategoryAction(id: string) {
  return runAction(z.string().min(1), id, async (categoryId, userId) => {
    await deleteCategory(db, userId, categoryId);
    revalidateAll();
    return { id: categoryId };
  });
}
