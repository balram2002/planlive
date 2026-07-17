import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin, isSeller } from "@/lib/current-user";
import { CategoryForm } from "@/components/seller/category-form";
import { CategoryList } from "@/components/seller/category-list";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** Seller-facing category management (admins get the same page in /admin). */
export default async function SellerCategoriesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isSeller(user) || !user.isActive) redirect("/dashboard");

  const categories = await prisma.category.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return (
    <div className="animate-page-in space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-sm text-muted">
            Buyers browse streams by category — only active ones show up.
          </p>
        </div>
        <CategoryList
          categories={categories}
          viewerId={user.id}
          viewerIsAdmin={isAdmin(user)}
        />
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">New category</h2>
        <CategoryForm />
      </Card>
    </div>
  );
}
