import type { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import { Channel } from '../models/channel.model.js';
import { AppError } from '../utils/app-error.js';

function readQueryValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const listChannels: RequestHandler = async (request, response) => {
  const search = readQueryValue(request.query.search);
  const category = readQueryValue(request.query.category);
  const country = readQueryValue(request.query.country);
  const requestedSort = readQueryValue(request.query.sort);

  // Start by showing only channels that are available to viewers.
  const filter: Record<string, unknown> = { isActive: true };

  if (search) {
    const searchExpression = new RegExp(escapeRegularExpression(search), 'i');
    filter.$or = [
      { name: searchExpression },
      { country: searchExpression },
      { categories: searchExpression }
    ];
  }

  if (category) {
    filter.categories = new RegExp(escapeRegularExpression(category), 'i');
  }

  if (country) {
    filter.country = new RegExp(`^${escapeRegularExpression(country)}$`, 'i');
  }

  // Only allow the two simple sorts that we want to explain in this version.
  const sort = requestedSort === 'country' ? 'country name' : 'name';
  const channels = await Channel.find(filter).sort(sort);

  response.json({ channels });
};

export const getChannel: RequestHandler = async (request, response) => {
  const channelId = request.params.id;

  if (!isValidObjectId(channelId)) {
    throw new AppError(400, 'INVALID_CHANNEL_ID', 'Channel id is invalid');
  }

  // TODO 2, 3 y 4:
  // Buscar el canal activo, responder 404 si no existe y devolverlo como JSON.
  // Mientras el ejercicio está pendiente, mantenemos una respuesta explícita y válida.
  response.status(501).json({
    error: {
      code: 'CHANNEL_WATCH_NOT_IMPLEMENTED',
      message: `Watching channel ${channelId} is not implemented yet`
    }
  });
};
