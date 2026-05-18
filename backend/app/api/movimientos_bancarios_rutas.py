from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from typing import List, Dict
from app.controllers.movimientos_bancarios_controller import importar_movimientos_controller, get_movimientos_by_community_controller
from app.servicios.auth import get_current_user_id

router = APIRouter()

@router.post("/{community_id}/importar")
async def importar_movimientos_bancarios(
    community_id: str,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id)
):
    return await importar_movimientos_controller(community_id, file, user_id)

@router.get("/{community_id}")
async def get_movimientos_bancarios_by_community(community_id: str, user_id: str = Depends(get_current_user_id)):
    return await get_movimientos_by_community_controller(community_id, user_id)