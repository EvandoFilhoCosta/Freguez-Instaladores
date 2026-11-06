// Venda de projeto (ex.: Compassion): marca a venda com o projeto, o beneficiário (criança) e o
// Id do presente. Essas vendas entram na lista em PDF e na nota do mês para a instituição.
import { cn } from "@freguez/ui";
import { useEffect, useMemo, useState } from "react";
import { api, semInternet } from "./api";
import { Button, Dialogo, Erro, Rodape, Rotulo } from "./componentes";
import { local } from "./local";

export type Beneficiario = { id: string; idLocal: string; nome: string };
export type ProjetoCaixa = { id: string; nome: string; codigo: string | null; beneficiarios: Beneficiario[] };
export type ProjetoDaVenda = { projetoId: string; projetoNome: string; beneficiarioId: string; beneficiarioNome: string; presenteId: string };

const campo = "h-10 w-full rounded-md border border-slate-300 bg-surface px-3 focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:outline-none";

/** Projetos com internet; sem internet, os guardados da última vez. */
async function carregarProjetos(): Promise<ProjetoCaixa[]> {
  try {
    const r = await api<{ projetos: ProjetoCaixa[] }>("/pdv/projetos");
    await (await local()).gravar("projetos", r.projetos);
    return r.projetos;
  } catch (e) {
    if (!semInternet(e)) throw e;
    return (await (await local()).ler<ProjetoCaixa[]>("projetos")) ?? [];
  }
}

export function DialogoProjeto({ atual, aoEscolher, aoFechar }: { atual: ProjetoDaVenda | null; aoEscolher: (p: ProjetoDaVenda | null) => void; aoFechar: () => void }) {
  const [projetos, setProjetos] = useState<ProjetoCaixa[]>();
  const [projetoId, setProjetoId] = useState(atual?.projetoId ?? "");
  const [busca, setBusca] = useState("");
  const [benef, setBenef] = useState<Beneficiario | null>(atual ? { id: atual.beneficiarioId, idLocal: "", nome: atual.beneficiarioNome } : null);
  const [presente, setPresente] = useState(atual?.presenteId ?? "");
  const [novo, setNovo] = useState<{ idLocal: string; nome: string; idPadrinho: string } | null>(null);
  const [erro, setErro] = useState<string>();

  useEffect(() => {
    carregarProjetos().then(
      (p) => {
        setProjetos(p);
        if (!projetoId && p.length === 1) setProjetoId(p[0]!.id);
      },
      (e) => setErro(e instanceof Error ? e.message : "Erro ao carregar projetos."),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const projeto = projetos?.find((p) => p.id === projetoId);
  const achados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!projeto || t.length < 2) return [];
    return projeto.beneficiarios.filter((b) => b.nome.toLowerCase().includes(t) || b.idLocal.toLowerCase().includes(t)).slice(0, 20);
  }, [projeto, busca]);

  const cadastrar = async () => {
    if (!novo || !projeto) return;
    setErro(undefined);
    try {
      const r = await api<{ beneficiario: Beneficiario }>("/pdv/projetos/beneficiario", { projetoId: projeto.id, ...novo });
      setProjetos((ps) => ps?.map((p) => (p.id === projeto.id ? { ...p, beneficiarios: [...p.beneficiarios.filter((b) => b.id !== r.beneficiario.id), r.beneficiario] } : p)));
      setBenef(r.beneficiario);
      setNovo(null);
    } catch (e) {
      setErro(semInternet(e) ? "Sem internet: não dá para cadastrar beneficiário novo agora." : e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <Dialogo titulo="Venda de projeto (F12)" aoFechar={aoFechar} largura="max-w-xl">
      {!projetos ? (
        <p className="text-ink-muted">Carregando…</p>
      ) : !projetos.length ? (
        <p className="text-ink-muted">Nenhum projeto cadastrado. O dono cria em Projetos, no painel.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <Rotulo htmlFor="proj">Projeto</Rotulo>
            <select id="proj" value={projetoId} onChange={(e) => (setProjetoId(e.target.value), setBenef(null))} className={campo}>
              <option value="">Escolha…</option>
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                  {p.codigo ? ` (${p.codigo})` : ""}
                </option>
              ))}
            </select>
          </div>
          {projeto &&
            (benef ? (
              <div className="flex items-center justify-between rounded-md bg-navy-50 px-3 py-2 text-sm">
                <span>
                  Beneficiário: <strong>{benef.nome}</strong> {benef.idLocal && <span className="num text-ink-muted">{benef.idLocal}</span>}
                </span>
                <button className="text-brand hover:underline" onClick={() => setBenef(null)}>
                  trocar
                </button>
              </div>
            ) : novo ? (
              <div className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-3">
                <input autoFocus placeholder="Id local (BR0512…)" value={novo.idLocal} onChange={(e) => setNovo({ ...novo, idLocal: e.target.value })} className={campo} aria-label="Id local" />
                <input placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} className={cn(campo, "sm:col-span-2")} aria-label="Nome" />
                <input placeholder="Id do padrinho (opcional)" value={novo.idPadrinho} onChange={(e) => setNovo({ ...novo, idPadrinho: e.target.value })} className={campo} aria-label="Id do padrinho" />
                <div className="flex gap-2 sm:col-span-2">
                  <Button size="sm" disabled={!novo.idLocal.trim() || !novo.nome.trim()} onClick={() => void cadastrar()}>
                    Cadastrar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNovo(null)}>
                    Voltar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Rotulo htmlFor="benef">Beneficiário</Rotulo>
                <input id="benef" autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou Id local" className={campo} />
                <ul className="max-h-60 divide-y divide-line overflow-auto">
                  {achados.map((b) => (
                    <li key={b.id}>
                      <button onClick={() => setBenef(b)} className="flex w-full justify-between px-2 py-2 text-left hover:bg-navy-50">
                        <span>{b.nome}</span>
                        <span className="num text-xs text-ink-muted">{b.idLocal}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button className="self-start text-sm text-brand hover:underline" onClick={() => setNovo({ idLocal: "", nome: busca, idPadrinho: "" })}>
                  + Beneficiário novo
                </button>
              </div>
            ))}
          {projeto && benef && (
            <div>
              <Rotulo htmlFor="presente">Id do presente (opcional)</Rotulo>
              <input id="presente" value={presente} maxLength={40} onChange={(e) => setPresente(e.target.value)} placeholder="Ex.: Gl-13746800" className={campo} />
            </div>
          )}
        </div>
      )}
      <div className="mt-3">
        <Erro>{erro}</Erro>
      </div>
      <Rodape>
        {atual && (
          <Button variant="ghost" onClick={() => aoEscolher(null)}>
            Tirar projeto
          </Button>
        )}
        <Button
          disabled={!projeto || !benef}
          onClick={() => aoEscolher({ projetoId: projeto!.id, projetoNome: projeto!.nome, beneficiarioId: benef!.id, beneficiarioNome: benef!.nome, presenteId: presente.trim() })}
        >
          Marcar a venda
        </Button>
      </Rodape>
    </Dialogo>
  );
}
