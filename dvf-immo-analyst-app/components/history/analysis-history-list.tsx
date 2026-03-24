"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnalysisSummary } from "@/types/analysis";
import { formatDate, formatPrice } from "@/lib/utils";
import { PROPERTY_TYPE_LABELS, CONFIDENCE_COLORS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowRight, MapPin, Pencil, Trash2, Trash } from "lucide-react";

interface Props { analyses: AnalysisSummary[]; }

interface EditState {
  id: string;
  address: string;
  city: string;
  notes: string;
}

export function AnalysisHistoryList({ analyses: initial }: Props) {
  const router = useRouter();
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>(initial);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteAll, setDeleteAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSaveEdit() {
    if (!editState) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/analyses/${editState.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: editState.address, city: editState.city, notes: editState.notes }),
      });
      if (res.ok) {
        setAnalyses((prev) =>
          prev.map((a) =>
            a.id === editState.id
              ? { ...a, address: editState.address, city: editState.city, notes: editState.notes }
              : a
          )
        );
        setEditState(null);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/analyses/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAnalyses((prev) => prev.filter((a) => a.id !== id));
        setDeleteId(null);
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteAll() {
    setDeleting(true);
    try {
      const res = await fetch("/api/analyses", { method: "DELETE" });
      if (res.ok) {
        setAnalyses([]);
        setDeleteAll(false);
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  if (analyses.length === 0) {
    return (
      <Card>
        <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
          <p className="text-lg font-medium">Aucune analyse</p>
          <p className="text-sm mt-1">Commencez par créer une nouvelle estimation.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
          onClick={() => setDeleteAll(true)}
        >
          <Trash className="h-4 w-4" />
          Tout supprimer
        </Button>
      </div>

      <div className="space-y-2">
        {analyses.map((a) => (
          <Card key={a.id} className="hover:shadow-md transition-all hover:border-primary/30 group">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Link href={"/analyses/" + a.id} className="flex-1 min-w-0">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{PROPERTY_TYPE_LABELS[a.propertyType] ?? a.propertyType}</Badge>
                      <Badge variant={a.status === "COMPLETE" ? "success" : "secondary" as never} className="text-xs">
                        {a.status === "COMPLETE" ? "Complète" : a.status === "ARCHIVED" ? "Archivée" : "Brouillon"}
                      </Badge>
                    </div>
                    <p className="font-medium truncate flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {a.address}, {a.city}
                    </p>
                    <p className="text-xs text-muted-foreground">{a.surface} m² • {formatDate(a.createdAt)}</p>
                  </div>
                </Link>

                <div className="text-right shrink-0 space-y-1 min-w-[80px]">
                  {a.valuationMid ? (
                    <p className="font-bold text-primary">{formatPrice(a.valuationMid, true)}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">—</p>
                  )}
                  {a.confidence != null && a.confidenceLabel && (
                    <div className="flex items-center justify-end gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CONFIDENCE_COLORS[a.confidenceLabel] ?? "#6b7280" }} />
                      <span className="text-xs text-muted-foreground">{a.confidenceLabel}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    title="Modifier"
                    onClick={(e) => {
                      e.preventDefault();
                      setEditState({ id: a.id, address: a.address ?? "", city: a.city ?? "", notes: a.notes ?? "" });
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Supprimer"
                    onClick={(e) => {
                      e.preventDefault();
                      setDeleteId(a.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Link href={"/analyses/" + a.id} tabIndex={-1}>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal édition */}
      <Dialog open={!!editState} onOpenChange={(open) => !open && setEditState(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier l'analyse</DialogTitle>
          </DialogHeader>
          {editState && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-address">Adresse</Label>
                <Input
                  id="edit-address"
                  value={editState.address}
                  onChange={(e) => setEditState({ ...editState, address: e.target.value })}
                  placeholder="Adresse du bien"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-city">Ville</Label>
                <Input
                  id="edit-city"
                  value={editState.city}
                  onChange={(e) => setEditState({ ...editState, city: e.target.value })}
                  placeholder="Ville"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editState.notes}
                  onChange={(e) => setEditState({ ...editState, notes: e.target.value })}
                  placeholder="Notes libres sur cette analyse…"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditState(null)}>Annuler</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal confirmation suppression unitaire */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer cette analyse ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Cette action est irréversible.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={deleting}
            >
              {deleting ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal confirmation tout supprimer */}
      <Dialog open={deleteAll} onOpenChange={(open) => !open && setDeleteAll(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer toutes les analyses ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {analyses.length} analyse{analyses.length > 1 ? "s" : ""} sera{analyses.length > 1 ? "ont" : ""} définitivement supprimée{analyses.length > 1 ? "s" : ""}. Cette action est irréversible.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAll(false)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDeleteAll} disabled={deleting}>
              {deleting ? "Suppression…" : "Tout supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
