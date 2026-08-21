"use client";

import { useEffect, useState } from "react";

type PublicDoctorRating = {
  doctorName: string;
  averageRating: number | null;
  ratingCount: number;
};

let ratingsRequest: Promise<PublicDoctorRating[]> | null = null;

function loadPublicDoctorRatings() {
  if (!ratingsRequest) {
    ratingsRequest = fetch("/api/public/doctor-ratings")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { ratings?: PublicDoctorRating[] } | null) => payload?.ratings ?? [])
      .catch(() => []);
  }

  return ratingsRequest;
}

export function PublicDoctorRating({ doctorName }: { doctorName: string }) {
  const [rating, setRating] = useState<PublicDoctorRating | null>(null);

  useEffect(() => {
    let active = true;

    loadPublicDoctorRatings()
      .then((ratings) => {
        if (!active) {
          return;
        }

        setRating(ratings.find((item) => item.doctorName === doctorName) ?? null);
      });

    return () => {
      active = false;
    };
  }, [doctorName]);

  if (!rating?.ratingCount || rating.averageRating === null) {
    return null;
  }

  return (
    <p className="mt-3 text-sm font-semibold text-[color:var(--foreground)]">
      Patient rating: {rating.averageRating.toFixed(1)}/5 ({rating.ratingCount})
    </p>
  );
}
