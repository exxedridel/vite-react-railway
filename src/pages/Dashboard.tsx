import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/AppContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { removePokemon } from "@/slices/partySlice";

const STAT_LABELS: Record<string, string> = {
  hp: "HP",
  attack: "Attack",
  defense: "Defense",
  "special-attack": "Sp. Atk",
  "special-defense": "Sp. Def",
  speed: "Speed",
};

const Dashboard = () => {
  const { setPokemonDialogOpen } = useAppContext();

  const dispatch = useAppDispatch();
  const party = useAppSelector((state) => state.party.pokemons);

  const hasPokemon = party.length > 0;

  return (
    <div className="container mx-auto px-2 flex flex-col items-center gap-6">
      {!hasPokemon && (
        <>
          <div className="flex flex-col items-center justify-center select-none">
            
            <h1 className="mb-6 text-[32px] italic flex flex-col justify-center items-center gap-2">
              <img
                src="/pokemon-logo.png"
                alt="pokemon-logo"
                width={300}
                height={300}
                className="-mt-2"
              />
              {/* <HandCoins className="text-brand ml-4" size={90} /> */}
              <span className="-mt-28 mb-4">
                <span className="">Master</span>
                <span className="font-bold">Trainer</span>
              </span>
            </h1>
            <span className="text-3xl font-light -mt-12">Digital Edition</span>
          </div>

          <button
            type="button"
            onClick={() => setPokemonDialogOpen(true)}
            className="card w-full max-w-[800px] space-y-1 text-center cursor-pointer select-none mt-8"
          >
            <span className="flex flex-row justify-center items-center gap-1 font-bold text-lg">
              <Plus className="text-brand shrink-0 mt-[0.5px]" />
              <span>Add a pokémon</span>
            </span>

            <span className="block">
              &nbsp;While you have the token&nbsp; 🔴🟢🔵🟡
            </span>
          </button>
        </>
      )}

      {hasPokemon && (
        <div className="w-full max-w-[800px]">
          <h2 className="mb-4 text-lg font-bold ml-2">
            Party · {party.length}/6 pokémon
          </h2>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {party.map(({ captureId, pokemon }) => (
              <article
                key={captureId}
                className="min-w-0 rounded-2xl border bg-card p-3 text-card-foreground shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    #{String(pokemon.id).padStart(3, "0")}
                  </p>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => dispatch(removePokemon(captureId))}
                    aria-label={`Eliminar a ${pokemon.name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {pokemon.image ? (
                  <img
                    src={pokemon.image}
                    alt={pokemon.name}
                    className="my-2 h-28 w-full object-contain sm:h-36"
                  />
                ) : (
                  <div className="my-2 flex h-28 items-center justify-center text-xs text-muted-foreground sm:h-36">
                    No image available
                  </div>
                )}

                <h3 className="break-words font-semibold capitalize">
                  {pokemon.name}
                </h3>

                <div className="mt-2 flex flex-wrap gap-1">
                  {pokemon.types.map((type) => (
                    <span
                      key={type}
                      className="rounded-md bg-muted px-2 py-1 text-xs capitalize text-muted-foreground"
                    >
                      {type}
                    </span>
                  ))}
                </div>

                <div className="mt-4 border-t pt-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    Base stats
                  </p>

                  <dl className="space-y-1">
                    {pokemon.stats.map((stat) => (
                      <div
                        key={stat.name}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <dt className="text-muted-foreground">
                          {STAT_LABELS[stat.name] ?? stat.name}
                        </dt>

                        <dd className="font-semibold tabular-nums">
                          {stat.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

// import { getTasksReq } from "@/services/tasks.api";
// import { useGetPokemonsQuery } from "@/api/creditsApi";

// const {
//   data: pokemons,
//   isLoading: isLoadingPokemons,
//   isError: isErrorPokemons,
//   error: errorPokemons,
// } = useGetPokemonsQuery();

// useEffect(() => {
//   window.scrollTo({ top: 0, behavior: "smooth" });
//   const getTasks = async () => {
//     setLoading(true);
//     await getTasksReq()
//       .then((res) => {
//         console.log("getTasksReq Res:: ", res.data);
//         setTasks(res?.data);
//       })
//       .catch((err) => {
//         console.log("getTasksReq Err:: ", err);
//       })
//       .finally(() => {
//         setLoading(false);
//       });
//   };
//   getTasks();
// }, []);

{
  /* <br /> */
}
{
  /* <div className="w-full">
          <div className="flex justify-end">
            <Button
              disabled
              variant="default"
              onClick={() => navigate("/buscar-poliza")}
            >
              Nuevo crédito
            </Button>
          </div>
        </div> */
}

{
  /* {tasks?.map((task: any, i: number) => (
        <div key={i} className="card w-full md:w-[800px]">
          {JSON.stringify(task, null, 2)}
        </div>
      ))} */
}

{
  /* <pre>
        <code>{JSON.stringify(pokemons, null, 2)}</code>
      </pre> */
}
