import { useParams } from 'wouter';
import ShopPage from './ShopPage';

/** Pagina di una categoria dello shop: /online-shop/categoria/<valore>. */
export default function ShopCategoryPage() {
  const { value } = useParams<{ value: string }>();
  let categoryValue = value;
  try {
    categoryValue = decodeURIComponent(value);
  } catch {
    // Indirizzo con una codifica rotta: si usa com'è e la pagina dirà che la categoria non c'è.
  }
  return <ShopPage key={categoryValue} categoryValue={categoryValue} />;
}
