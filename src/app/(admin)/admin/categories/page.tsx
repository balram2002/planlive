import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { CategoryForm } from "@/components/seller/category-form";
import { CategoryList } from "@/components/seller/category-list";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** Admin category management: full control incl. hide/activate + delete. */
export default async function AdminCategoriesPage() {
  // Admin layout already guards; user needed for list permissions display.
  const user = await getCurrentUser();

  const categories = await prisma.category.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return (
    <div className="animate-page-in space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-sm text-muted">
            Curate what buyers can browse — hidden categories disappear from
            the homepage and go-live picker.
          </p>
        </div>
        <CategoryList
          categories={categories}
          viewerId={user?.id ?? ""}
          viewerIsAdmin
        />
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">New category</h2>
        <CategoryForm />
      </Card>
    </div>
  );
}
