import { Router } from "express";

import { isDatabaseConfigured, query } from "../db/client.js";

const publicRouter = Router();

publicRouter.get("/doctor-ratings", async (_request, response, next) => {
  try {
    if (!isDatabaseConfigured()) {
      response.json({ success: true, ratings: [] });
      return;
    }

    const result = await query<{
      doctor_id: string;
      doctor_name: string;
      average_rating: string | null;
      rating_count: string;
    }>(
      `select
        d.id as doctor_id,
        d.name as doctor_name,
        avg(r.rating)::text as average_rating,
        count(r.id)::text as rating_count
       from doctors d
       left join doctor_ratings r
         on r.organization_id = d.organization_id and r.doctor_id = d.id
       group by d.id, d.name
       order by d.name asc`,
    );

    response.json({
      success: true,
      ratings: result.rows.map((row) => ({
        doctorId: row.doctor_id,
        doctorName: row.doctor_name,
        averageRating: row.average_rating ? Number(row.average_rating) : null,
        ratingCount: Number(row.rating_count),
      })),
    });
  } catch (error) {
    next(error);
  }
});

export { publicRouter };
