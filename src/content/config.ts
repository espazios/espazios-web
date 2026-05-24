import { defineCollection, z } from 'astro:content';

const proyectos = defineCollection({
  type: 'content',
  schema: ({ image }) => z.object({
    title: z.string(),
    tipoProyecto: z.enum(['Remodelación completa', 'Carpintería', 'Solo acabados']),
    subtipo: z.enum(['Cocina', 'Baño', 'Apartamento', 'Closet', 'Sala', 'Oficina', 'Local']).optional(),
    ciudad: z.string(),
    barrio: z.string().optional(),
    descripcionCorta: z.string(),
    fotoPortada: image().optional(),
    fotoAntes: image().optional(),
    fotoDespues: image().optional(),
    galeria: z.array(image()).optional(),
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
  schema: ({ image }) => z.object({
    title: z.string(),
    excerpt: z.string(),
    categoria: z.enum(['Remodelación', 'Carpintería', 'Acabados', 'Guías y Consejos']),
    tags: z.array(z.string()).optional(),
    autor: z.string().default('Equipo Espazios'),
    fechaPublicacion: z.date(),
    fechaActualizacion: z.date().optional(),
    imagenDestacada: image().optional(),
    minutosLectura: z.number().optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { proyectos, blog };
