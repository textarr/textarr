import { z } from 'zod';

// ============================================
// Sonarr API Schemas
// ============================================

export const SonarrImageSchema = z.object({
  coverType: z.string(),
  url: z.string().optional(),
  remoteUrl: z.string().optional(),
});

export const SonarrSeasonSchema = z.object({
  seasonNumber: z.number(),
  monitored: z.boolean(),
});

export const SonarrSeriesSchema = z.object({
  id: z.number().optional(), // Sonarr internal ID (returned after adding)
  tvdbId: z.number(),
  title: z.string(),
  sortTitle: z.string().optional(),
  status: z.string().optional(),
  overview: z.string().optional(),
  network: z.string().optional(),
  airTime: z.string().optional(),
  images: z.array(SonarrImageSchema).optional(),
  remotePoster: z.string().optional(),
  seasons: z.array(SonarrSeasonSchema).optional(),
  year: z.number().optional(),
  qualityProfileId: z.number().optional(),
  seasonFolder: z.boolean().optional(),
  monitored: z.boolean().optional(),
  titleSlug: z.string().optional(),
  rootFolderPath: z.string().optional(),
  certification: z.string().optional(),
  genres: z.array(z.string()).optional(),
  tags: z.array(z.number()).optional(),
  added: z.string().optional(),
  ratings: z
    .object({
      votes: z.number(),
      value: z.number(),
    })
    .optional(),
  statistics: z
    .object({
      seasonCount: z.number().optional(),
      episodeCount: z.number().optional(),
      episodeFileCount: z.number().optional(),
      totalEpisodeCount: z.number().optional(),
      percentOfEpisodes: z.number().optional(),
    })
    .optional(),
});

export type SonarrSeries = z.infer<typeof SonarrSeriesSchema>;

export const SonarrQualityProfileSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const SonarrRootFolderSchema = z.object({
  id: z.number(),
  path: z.string(),
  freeSpace: z.number().optional(),
});

export const SonarrQueueItemSchema = z.object({
  seriesId: z.number().optional(),
  episodeId: z.number().optional(),
  title: z.string(),
  status: z.string(),
  sizeleft: z.number(),
  size: z.number(),
  timeleft: z.string().optional(),
});

// ============================================
// Radarr API Schemas
// ============================================

export const RadarrImageSchema = z.object({
  coverType: z.string(),
  url: z.string().optional(),
  remoteUrl: z.string().optional(),
});

export const RadarrMovieSchema = z.object({
  id: z.number().optional(), // Radarr internal ID (returned after adding)
  tmdbId: z.number(),
  title: z.string(),
  sortTitle: z.string().optional(),
  status: z.string().optional(),
  overview: z.string().optional(),
  studio: z.string().optional(),
  images: z.array(RadarrImageSchema).optional(),
  remotePoster: z.string().optional(),
  year: z.number().optional(),
  qualityProfileId: z.number().optional(),
  monitored: z.boolean().optional(),
  titleSlug: z.string().optional(),
  rootFolderPath: z.string().optional(),
  certification: z.string().optional(),
  genres: z.array(z.string()).optional(),
  tags: z.array(z.number()).optional(),
  added: z.string().optional(),
  runtime: z.number().optional(),
  ratings: z
    .object({
      votes: z.number(),
      value: z.number(),
    })
    .optional(),
  hasFile: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
});

export type RadarrMovie = z.infer<typeof RadarrMovieSchema>;

export const RadarrQualityProfileSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const RadarrRootFolderSchema = z.object({
  id: z.number(),
  path: z.string(),
  freeSpace: z.number().optional(),
});

export const RadarrQueueItemSchema = z.object({
  movieId: z.number().optional(),
  title: z.string(),
  status: z.string(),
  sizeleft: z.number(),
  size: z.number(),
  timeleft: z.string().optional(),
});
