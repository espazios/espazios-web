import { defineCollection, z } from 'astro:content';

const proyectos = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    tipoProyecto: z.enum(['Full Acabados', 'Solo Carpintería', 'Solo Obra Blanca']),
    torre: z.string().optional(),
    subtipo: z.enum(['Cocina', 'Baño', 'Apartamento', 'Closet', 'Sala', 'Oficina', 'Local']).optional(),
    ciudad: z.string(),
    barrio: z.string().optional(),
    descripcionCorta: z.string(),
    // Imágenes como strings (paths/URLs) para compatibilidad con Decap CMS.
    fotoPortada: z.string().optional(),
    fotoAntes: z.string().optional(),
    fotoDespues: z.string().optional(),
    galeria: z.array(z.string()).optional(),
    duracionSemanas: z.number().optional(),
    rangoPresupuesto: z.string().optional(),
    destacado: z.boolean().default(false),
    fechaEntrega: z.date(),
    testimonioCliente: z.string().optional(),
    nombreCliente: z.string().optional(),
    etiquetas: z.array(z.string()).optional(),
    tieneVideo: z.boolean().default(false),
    videoUrl: z.string().url().optional(),
    videoPlataforma: z.enum(['TikTok', 'Instagram', 'YouTube']).optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    excerpt: z.string(),
    categoria: z.enum(['Remodelación', 'Carpintería', 'Acabados', 'Guías y Consejos']),
    tags: z.array(z.string()).optional(),
    autor: z.string().default('Equipo Espazios'),
    fechaPublicacion: z.date(),
    fechaActualizacion: z.date().optional(),
    imagenDestacada: z.string().optional(),
    minutosLectura: z.number().optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { proyectos, blog };
