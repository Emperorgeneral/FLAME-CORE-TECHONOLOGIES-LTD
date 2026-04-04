import { Router } from "express";
import { prisma } from "../../config/prisma.js";

export const productRoutes = Router();

productRoutes.get("/", async (_req, res, next) => {
  try {
    const products = await prisma.websiteTemplate.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" }
    });
    res.json({ status: "OK", products });
  } catch (err) {
    next(err);
  }
});

productRoutes.get("/:slug", async (req, res, next) => {
  try {
    const product = await prisma.websiteTemplate.findUnique({
      where: { slug: req.params.slug }
    });
    if (!product || !product.isActive) {
      return res.status(404).json({ status: "NOT_FOUND", message: "Template not found" });
    }
    return res.json({ status: "OK", product });
  } catch (err) {
    return next(err);
  }
});
