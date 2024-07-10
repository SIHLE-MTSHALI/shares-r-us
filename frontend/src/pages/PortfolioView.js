import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchPortfoliosStart, fetchPortfoliosSuccess, fetchPortfoliosFailure, updateAssetPrice, deletePortfolio } from '../redux/reducers/portfolioReducer';
import { getPortfolio, getPortfolioHistory, deletePortfolio as deletePortfolioAPI, addAssetToPortfolio, removeAssetFromPortfolio, updatePortfolio } from '../services/api';
import WebSocketService from '../services/websocket';
import Layout from '../components/Layout';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { confirmAlert } from 'react-confirm-alert';
import 'react-confirm-alert/src/react-confirm-alert.css';
import { toast } from 'react-toastify';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const PortfolioView = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { portfolios, loading, error } = useSelector(state => state.portfolio);
  const [portfolio, setPortfolio] = useState(null);
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [],
  });
  const [timeRange, setTimeRange] = useState('1M');
  const [comparisonAsset, setComparisonAsset] = useState('');
  const [newAsset, setNewAsset] = useState({ symbol: '', quantity: '', purchasePrice: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [editedPortfolio, setEditedPortfolio] = useState({ name: '', description: '' });

  const fetchChartData = useCallback(async (portfolioData, range, comparison) => {
    if (!portfolioData) return;
    try {
      const historyData = await getPortfolioHistory(portfolioData.id, range);
      const labels = historyData.map(item => item.date);
      const portfolioValues = historyData.map(item => item.value);

      const datasets = [
        {
          label: 'Portfolio Value',
          data: portfolioValues,
          borderColor: '#c07830',
          backgroundColor: '#f5e6d6',
        },
      ];

      if (comparison) {
        const comparisonData = await getPortfolioHistory(comparison, range);
        const comparisonValues = comparisonData.map(item => item.value);
        datasets.push({
          label: `Comparison (${comparison})`,
          data: comparisonValues,
          borderColor: '#36A2EB',
          backgroundColor: '#9AD0F5',
        });
      }

      setChartData({ labels, datasets });
    } catch (error) {
      console.error('Error fetching chart data:', error);
      toast.error('Failed to fetch chart data');
    }
  }, []);

  useEffect(() => {
    const fetchPortfolioData = async () => {
      dispatch(fetchPortfoliosStart());
      try {
        const data = await getPortfolio(id);
        dispatch(fetchPortfoliosSuccess([data]));
        setPortfolio(data);
        fetchChartData(data, timeRange, comparisonAsset);

        // Subscribe to real-time updates for each asset
        data.assets.forEach(asset => {
          WebSocketService.subscribeToAsset(asset.symbol);
        });

        // Set up WebSocket listener
        WebSocketService.onPriceUpdate((update) => {
          dispatch(updateAssetPrice({
            portfolioId: id,
            assetSymbol: update.symbol,
            newPrice: update.price
          }));
        });
      } catch (error) {
        dispatch(fetchPortfoliosFailure(error.message));
        toast.error('Failed to fetch portfolio data');
      }
    };

    fetchPortfolioData();

    // Cleanup function
    return () => {
      WebSocketService.offPriceUpdate();
    };
  }, [dispatch, id, timeRange, comparisonAsset, fetchChartData]);

  // Separate useEffect for WebSocket unsubscriptions
  useEffect(() => {
    return () => {
      if (portfolio) {
        portfolio.assets.forEach(asset => {
          WebSocketService.unsubscribeFromAsset(asset.symbol);
        });
      }
    };
  }, [portfolio]);

  useEffect(() => {
    fetchChartData(portfolio, timeRange, comparisonAsset);
  }, [portfolio, timeRange, comparisonAsset, fetchChartData]);

  const handleDeletePortfolio = () => {
    confirmAlert({
      title: 'Confirm deletion',
      message: 'Are you sure you want to delete this portfolio?',
      buttons: [
        {
          label: 'Yes',
          onClick: async () => {
            try {
              await deletePortfolioAPI(id);
              dispatch(deletePortfolio(id));
              toast.success('Portfolio deleted successfully');
              navigate('/');
            } catch (error) {
              toast.error('Failed to delete portfolio');
            }
          }
        },
        {
          label: 'No',
          onClick: () => {}
        }
      ]
    });
  };

  const handleAddAsset = async (e) => {
    e.preventDefault();
    try {
      await addAssetToPortfolio(id, newAsset);
      const updatedPortfolio = await getPortfolio(id);
      setPortfolio(updatedPortfolio);
      setNewAsset({ symbol: '', quantity: '', purchasePrice: '' });
      toast.success('Asset added successfully');
    } catch (error) {
      toast.error('Failed to add asset');
    }
  };

  const handleRemoveAsset = async (assetId) => {
    confirmAlert({
      title: 'Confirm removal',
      message: 'Are you sure you want to remove this asset?',
      buttons: [
        {
          label: 'Yes',
          onClick: async () => {
            try {
              await removeAssetFromPortfolio(id, assetId);
              const updatedPortfolio = await getPortfolio(id);
              setPortfolio(updatedPortfolio);
              toast.success('Asset removed successfully');
            } catch (error) {
              toast.error('Failed to remove asset');
            }
          }
        },
        {
          label: 'No',
          onClick: () => {}
        }
      ]
    });
  };

  const handleEditPortfolio = () => {
    setEditedPortfolio({ name: portfolio.name, description: portfolio.description });
    setIsEditing(true);
  };

  const handleSavePortfolio = async () => {
    try {
      const updatedPortfolio = await updatePortfolio(id, editedPortfolio);
      setPortfolio(updatedPortfolio);
      setIsEditing(false);
      toast.success('Portfolio updated successfully');
    } catch (error) {
      toast.error('Failed to update portfolio');
    }
  };

  if (loading) return <Layout><div>Loading...</div></Layout>;
  if (error) return <Layout><div>Error: {error}</div></Layout>;
  if (!portfolio) return <Layout><div>Portfolio not found</div></Layout>;

  return (
    <Layout>
      <h1 className="text-3xl font-bold mb-4">{portfolio.name}</h1>
      {isEditing ? (
        <div className="mb-4">
          <input
            type="text"
            value={editedPortfolio.name}
            onChange={(e) => setEditedPortfolio({...editedPortfolio, name: e.target.value})}
            className="p-2 border rounded mr-2"
          />
          <input
            type="text"
            value={editedPortfolio.description}
            onChange={(e) => setEditedPortfolio({...editedPortfolio, description: e.target.value})}
            className="p-2 border rounded mr-2"
          />
          <button 
            onClick={handleSavePortfolio}
            className="bg-accent text-white px-4 py-2 rounded hover:bg-opacity-90 transition-colors"
          >
            Save
          </button>
        </div>
      ) : (
        <button 
          onClick={handleEditPortfolio}
          className="bg-accent text-white px-4 py-2 rounded hover:bg-opacity-90 transition-colors mb-4"
        >
          Edit Portfolio
        </button>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-2">Portfolio Performance</h2>
          <div className="mb-4">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="mr-2 p-2 border rounded"
            >
              <option value="1W">1 Week</option>
              <option value="1M">1 Month</option>
              <option value="3M">3 Months</option>
              <option value="1Y">1 Year</option>
            </select>
            <select
              value={comparisonAsset}
              onChange={(e) => setComparisonAsset(e.target.value)}
              className="p-2 border rounded"
            >
              <option value="">No Comparison</option>
              {portfolios.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <Line data={chartData} />
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-2">Portfolio Details</h2>
          <p>Total Value: ${portfolio.total_value.toFixed(2)}</p>
          <p>Number of Assets: {portfolio.assets.length}</p>
        </div>
      </div>
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <h2 className="text-xl font-semibold mb-2">Assets</h2>
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left">Symbol</th>
              <th className="text-left">Quantity</th>
              <th className="text-left">Current Price</th>
              <th className="text-left">Total Value</th>
              <th className="text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.assets.map(asset => (
              <tr key={asset.id}>
                <td>{asset.symbol}</td>
                <td>{asset.quantity}</td>
                <td>${asset.current_price.toFixed(2)}</td>
                <td>${asset.total_value.toFixed(2)}</td>
                <td>
                  <button 
                    onClick={() => handleRemoveAsset(asset.id)}
                    className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 transition-colors"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <h2 className="text-xl font-semibold mb-2">Add Asset</h2>
        <form onSubmit={handleAddAsset} className="flex flex-wrap items-end">
          <div className="mr-2 mb-2">
            <label htmlFor="symbol" className="block">Symbol</label>
            <input
              id="symbol"
              type="text"
              value={newAsset.symbol}
              onChange={(e) => setNewAsset({...newAsset, symbol: e.target.value})}
              className="p-2 border rounded"
              required
            />
          </div>
          <div className="mr-2 mb-2">
            <label htmlFor="quantity" className="block">Quantity</label>
            <input
              id="quantity"
              type="number"
              value={newAsset.quantity}
              onChange={(e) => setNewAsset({...newAsset, quantity: e.target.value})}
              className="p-2 border rounded"
              required
            />
          </div>
          <div className="mr-2 mb-2">
            <label htmlFor="purchasePrice" className="block">Purchase Price</label>
            <input
              id="purchasePrice"
              type="number"
              value={newAsset.purchasePrice}
              onChange={(e) => setNewAsset({...newAsset, purchasePrice: e.target.value})}
              className="p-2 border rounded"
              required
            />
          </div>
          <button 
            type="submit" 
            className="bg-accent text-white px-4 py-2 rounded hover:bg-opacity-90 transition-colors"
          >
            Add Asset
          </button>
        </form>
      </div>
      <button 
        onClick={handleDeletePortfolio} 
        className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors"
      >
        Delete Portfolio
      </button>
    </Layout>
  );
};

export default PortfolioView;